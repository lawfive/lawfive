import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Lang;

//! Records the match as a Garmin soccer activity (ACT-1, ACT-2).
module Recorder {
    var _session as ActivityRecording.Session? = null;

    function start(name as String) as Void {
        if (!(Toybox has :ActivityRecording)) {
            return;
        }
        var session = _session;
        if (session == null) {
            session = ActivityRecording.createSession({:name => name, :sport => Activity.SPORT_SOCCER});
            _session = session;
        }
        if (!session.isRecording()) {
            session.start();
        }
    }

    function pause() as Void {
        var session = _session;
        if (session != null && session.isRecording()) {
            session.stop();
        }
    }

    //! Resumes after half-time, marking the new period as a lap.
    function resume(name as String) as Void {
        var hadSession = _session != null;
        start(name);
        var session = _session;
        if (hadSession && session != null) {
            session.addLap();
        }
    }

    function save() as Void {
        var session = _session;
        if (session != null) {
            if (session.isRecording()) {
                session.stop();
            }
            session.save();
            _session = null;
        }
    }

    function discard() as Void {
        var session = _session;
        if (session != null) {
            if (session.isRecording()) {
                session.stop();
            }
            session.discard();
            _session = null;
        }
    }

    function isRecording() as Boolean {
        var session = _session;
        return session != null && session.isRecording();
    }
}
