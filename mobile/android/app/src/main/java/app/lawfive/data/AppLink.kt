package app.lawfive.data

import java.net.URI
import java.net.URLDecoder

// What a QR code or a lawfive:// link asks the app to do (APP-13, APP-14). The web app's QR codes
// hold its own pages, so a phone's camera can open them too: https://server/get-app#CODE for
// signing in and https://server/invite/TOKEN for an invitation. The web pages open the app with
// lawfive://sign-in?server=…&code=… and lawfive://invite?server=…&token=….

sealed interface AppLink {
    val server: String

    data class SignIn(override val server: String, val code: String) : AppLink
    data class Invite(override val server: String, val token: String) : AppLink

    companion object {
        private val tokenPattern = Regex("[A-Za-z0-9_-]{11,99}")

        /** Upper case, letters and digits only, or null unless it's eight of them. */
        fun normaliseCode(text: String): String? = text.uppercase().filter { it in 'A'..'Z' || it in '0'..'9' }.takeIf { it.length == 8 }

        /** The link, or null when it isn't one of ours. http only with allowHttp, as a debug build can reach a local server. */
        fun parse(text: String, allowHttp: Boolean = false): AppLink? {
            val uri = runCatching { URI(text.trim()) }.getOrNull() ?: return null
            return when (uri.scheme?.lowercase()) {
                "lawfive" -> {
                    val query = (uri.rawQuery ?: "").split("&").mapNotNull { pair ->
                        val parts = pair.split("=", limit = 2)
                        if (parts.size == 2) parts[0] to URLDecoder.decode(parts[1], "UTF-8") else null
                    }.toMap()
                    val server = query["server"]?.let { serverOf(it, allowHttp) } ?: return null
                    make(uri.host, server, query["code"], query["token"])
                }
                "http", "https" -> {
                    val server = serverOf(text.trim(), allowHttp) ?: return null
                    val path = uri.path.orEmpty().trimEnd('/')
                    when {
                        path == "/get-app" -> make("sign-in", server, uri.fragment, null)
                        path.startsWith("/invite/") -> make("invite", server, null, path.removePrefix("/invite/"))
                        else -> null
                    }
                }
                else -> null
            }
        }

        private fun make(kind: String?, server: String, code: String?, token: String?): AppLink? = when (kind) {
            "sign-in" -> code?.let(::normaliseCode)?.let { SignIn(server, it) }
            "invite" -> token?.takeIf { tokenPattern.matches(it) }?.let { Invite(server, it) }
            else -> null
        }

        /** The address's origin. A name before an @ could pass for the server's own, so it's refused. */
        fun serverOf(address: String, allowHttp: Boolean = false): String? {
            val uri = runCatching { URI(address.trim()) }.getOrNull() ?: return null
            val scheme = uri.scheme?.lowercase()
            if (scheme != "https" && !(scheme == "http" && allowHttp)) return null
            if (uri.host.isNullOrEmpty() || uri.rawUserInfo != null) return null
            return "$scheme://${uri.host}${if (uri.port > 0) ":${uri.port}" else ""}"
        }
    }
}
