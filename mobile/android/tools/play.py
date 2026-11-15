#!/usr/bin/env python3
# Uploads a release bundle to a Google Play testing track (runbook Google 7), with the Play Developer
# API and a service account kept outside the repo (lawfive.play.key in local.properties, a JSON key
# with "Release apps to testing tracks"). Production stays a click in Play Console. Run from anywhere:
#   mobile/android/tools/play.py tracks
#   mobile/android/tools/play.py upload <bundle.aab> <track> ["release notes"]
#   mobile/android/tools/play.py release <version code> <track> ["release notes"]   (one already uploaded)
# Tracks are Play's names: internal, alpha (closed testing), and for Wear OS wear:internal, wear:alpha.
# No libraries: the token is signed with openssl, as the key never leaves this machine.
import base64, json, os, subprocess, sys, tempfile, time, urllib.parse, urllib.request
from pathlib import Path

PACKAGE = "app.lawfive"
API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}"
UPLOAD = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PACKAGE}"


def key_path():
    props = Path(__file__).resolve().parent.parent / "local.properties"
    for line in props.read_text().splitlines() if props.exists() else []:
        if line.startswith("lawfive.play.key="):
            return Path(line.split("=", 1)[1].strip()).expanduser()
    sys.exit("No lawfive.play.key in mobile/android/local.properties (the service account's JSON key).")


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def token():
    key = json.loads(key_path().read_text())
    now = int(time.time())
    claims = {"iss": key["client_email"], "scope": "https://www.googleapis.com/auth/androidpublisher",
              "aud": key["token_uri"], "iat": now, "exp": now + 600}
    unsigned = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()) + "." + b64(json.dumps(claims).encode())
    with tempfile.TemporaryDirectory() as tmp:
        pem = Path(tmp) / "key.pem"
        pem.touch(mode=0o600)
        pem.write_text(key["private_key"])
        signature = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(pem)], input=unsigned.encode(),
                                   capture_output=True, check=True).stdout
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                   "assertion": unsigned + "." + b64(signature)}).encode()
    return json.load(urllib.request.urlopen(urllib.request.Request(key["token_uri"], data=body)))["access_token"]


def call(method, url, auth, body=None, content_type="application/json"):
    data = json.dumps(body).encode() if isinstance(body, dict) else body
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={"Authorization": f"Bearer {auth}", "Content-Type": content_type})
    try:
        with urllib.request.urlopen(request, timeout=600) as answer:
            text = answer.read()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as error:
        sys.exit(f"Play said {error.code} for {method} {url.split(PACKAGE)[-1]}: {error.read().decode()[:600]}")


def tracks():
    auth = token()
    edit = call("POST", f"{API}/edits", auth, {})["id"]
    for track in call("GET", f"{API}/edits/{edit}/tracks", auth).get("tracks", []):
        releases = [f"{r.get('name', '')} {r.get('versionCodes', [])} {r.get('status')}" for r in track.get("releases", [])]
        print(f"{track['track']}: {', '.join(releases) or 'no releases'}")
    call("DELETE", f"{API}/edits/{edit}", auth)


def upload(bundle, track, notes, code=None):
    auth = token()
    edit = call("POST", f"{API}/edits", auth, {})["id"]
    if code is None:
        print(f"Uploading {Path(bundle).name}…")
        code = call("POST", f"{UPLOAD}/edits/{edit}/bundles?uploadType=media", auth, Path(bundle).read_bytes(),
                    "application/octet-stream")["versionCode"]
    release = {"versionCodes": [str(code)], "status": "completed"}
    if notes:
        release["releaseNotes"] = [{"language": "en-US", "text": notes}]
    call("PUT", f"{API}/edits/{edit}/tracks/{urllib.parse.quote(track, safe='')}", auth,
         {"track": track, "releases": [release]})
    call("POST", f"{API}/edits/{edit}:commit", auth)
    print(f"Version code {code} is on {track}; Play reviews it if the track needs it.")


if __name__ == "__main__":
    if sys.argv[1:2] == ["tracks"]:
        tracks()
    elif sys.argv[1:2] == ["upload"] and len(sys.argv) in (4, 5):
        upload(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) == 5 else "")
    elif sys.argv[1:2] == ["release"] and len(sys.argv) in (4, 5):
        upload(None, sys.argv[3], sys.argv[4] if len(sys.argv) == 5 else "", int(sys.argv[2]))
    else:
        sys.exit(__doc__ or "Usage: play.py tracks | play.py upload <bundle.aab> <track> [\"release notes\"]")
