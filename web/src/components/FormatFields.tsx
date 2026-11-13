import type { ReactNode } from "react";
import type { MatchFormat } from "../api.ts";
import { Field, InfoTip, MinutesInput, NumberInput, Select, Toggle } from "./ui.tsx";

// The match format, as in Create match on the watch (SET-9) and with the same ranges (UI-8), in the
// groups of WEB-15. What only matters with a switch on opens under that switch. How the clock
// counts isn't here: it's the account's, in the match screen (TMR-11); whether it stops is (TMR-15).

export function FormatFields({ format, onChange }: { format: MatchFormat; onChange: (format: MatchFormat) => void }) {
    const set = <K extends keyof MatchFormat>(key: K, value: MatchFormat[K]) => onChange({ ...format, [key]: value });
    return (
        <div className="format-groups">
            <div>
                <h3>Time</h3>
                <div className="fields">
                    <Field label="Periods" info="Most matches are two halves. Some youth leagues play three or four periods (quarters), and some tournaments a single period.">
                        <Select value={String(format.periods)} onChange={(v) => set("periods", Number(v ?? 2))} options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]} />
                    </Field>
                    <Field label="Period length (min)"><MinutesInput sec={format.periodSec} min={1} max={60} onChange={(v) => set("periodSec", v)} /></Field>
                    <Field label={breakLabel(format.periods)}><MinutesInput sec={format.breakSec} min={0} max={30} onChange={(v) => set("breakSec", v)} /></Field>
                    <Field label="Team size" info="Players per side on the field (11 v 11, 9 v 9, 7 v 7). Kept with the match; the watch doesn't use it yet."><NumberInput value={format.teamSize} min={1} max={11} onChange={(v) => set("teamSize", v ?? 11)} /></Field>
                </div>
            </div>

            {/* WEB-15: side by side where the form has room. Fixed columns, so a follow-up field opening stays in its own. */}
            <div className="format-checks">
                <div className="format-groups-column">
                    <div>
                        <h3>Halfway break</h3>
                        <Switch label="Break halfway through each period" checked={format.halfwayBreak} onChange={(v) => set("halfwayBreak", v)}
                            info="A short planned stop halfway through each period of normal time: a hydration (water) break in hot weather, or a substitution break in leagues that allow one (some AYSO age groups, for example). The watch counts down to it and then times it." />
                        {format.halfwayBreak && (
                            <div className="format-reveal">
                                <div className="row">
                                    <span>Length</span>
                                    <div style={{ width: 80 }}><MinutesInput sec={format.halfwayBreakSec} min={0} max={15} onChange={(v) => set("halfwayBreakSec", v)} /></div>
                                    <span className="muted">min</span>
                                </div>
                                {/* TMR-12: it only applies with a stoppage clock to add the break to; a clock that stops always stops for the break (TMR-15). */}
                                {format.trackStoppage && !format.stoppingClock && (
                                    <Switch label="Add the break to stoppage" checked={format.breakStoppage ?? true} onChange={(v) => set("breakStoppage", v)}
                                        info="The halfway break's time is added on at the end of the period, as the Laws allow for drinks and cooling breaks (Law 7). The watch runs the stoppage clock while the break does. Turn it off where the clock runs through the break." />
                                )}
                            </div>
                        )}
                    </div>

                    {/* EVT-12: after the halfway break, as on the watch's Create match. */}
                    <div>
                        <h3>Sin bins</h3>
                        <Switch label="Temporary dismissals" checked={format.sinBins ?? false} onChange={(v) => onChange({ ...format, sinBins: v, sinBinSec: format.sinBinSec ?? 600 })}
                            info="Where the competition uses them: a player sin-binned is off for a set time, then can come back on. The watch has Sin bin in each team's menu, counts each one down with the match clock (waiting through breaks), and buzzes when the player can return. A second sin bin for the same player is a send-off." />
                        {format.sinBins && (
                            <div className="format-reveal">
                                <div className="row">
                                    <span>Length</span>
                                    <div style={{ width: 80 }}><MinutesInput sec={format.sinBinSec ?? 600} min={1} max={20} onChange={(v) => set("sinBinSec", v)} /></div>
                                    <span className="muted">min</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <h3>If the score is level</h3>
                        <Switch label="Extra time" checked={format.extraTime} onChange={(v) => set("extraTime", v)}
                            info="Played if the score is level at the end of normal time, when the competition requires a winner. The watch asks at full time whether to play it." />
                        {format.extraTime && (
                            <div className="format-reveal">
                                <div className="row">
                                    <div style={{ width: 64 }}><Select value={String(format.extraTimePeriods)} onChange={(v) => set("extraTimePeriods", Number(v ?? 2))} options={[["1", "1"], ["2", "2"]]} /></div>
                                    <span>{format.extraTimePeriods === 1 ? "period of" : "periods of"}</span>
                                    <div style={{ width: 80 }}><MinutesInput sec={format.extraTimePeriodSec} min={1} max={30} onChange={(v) => set("extraTimePeriodSec", v)} /></div>
                                    <span className="muted">min</span>
                                </div>
                                {/* ET-6 */}
                                <Switch label="Golden goal" checked={format.goldenGoal ?? false} onChange={(v) => set("goldenGoal", v)}
                                    info="The first goal in extra time wins the match. The watch offers End match after it, with Undo for a goal entered by mistake." />
                            </div>
                        )}
                        <Switch label="Penalty shoot-out" checked={format.penalties} onChange={(v) => set("penalties", v)}
                            info="Kicks from the penalty mark to decide a winner. The watch tracks each kick and knows when the shoot-out is decided." />
                    </div>
                </div>
                <div className="format-groups-column">
                    <div>
                        <h3>On the watch</h3>
                        {/* TMR-15: the clock that stops, for US high school and college; it needs stoppage tracked, so it turns that on. */}
                        <div className="format-clock">
                            <Field label="Clock" info={<>
                                <p><b>Runs on:</b> the Laws of the Game. Stoppages are added on at the end of each period.</p>
                                <p><b>Stops when play stops:</b> US high school (NFHS) and college (NCAA) rules. Start/Stop on the watch stops the clock for a stoppage and starts it again at the restart, and the halfway break stops it too. There's no added time: the period ends when its clock reaches the length.</p>
                            </>}>
                                <Select value={format.stoppingClock ? "stops" : "runs"} onChange={(v) => onChange({ ...format, stoppingClock: v === "stops", ...(v === "stops" ? { trackStoppage: true, stopForGoalsCards: format.stopForGoalsCards ?? true } : {}) })}
                                    options={[["runs", "Runs on"], ["stops", "Stops when play stops"]]} />
                            </Field>
                        </div>
                        {format.stoppingClock && (
                            <div className="format-reveal">
                                <Switch label="Goals and cards stop it" checked={format.stopForGoalsCards ?? true} onChange={(v) => set("stopForGoalsCards", v)}
                                    info="Recording a goal or card on the watch stops the clock; Start/Stop starts it again at the restart. An injury always stops it." />
                            </div>
                        )}
                        <Switch label="Track stoppage" checked={format.trackStoppage || (format.stoppingClock ?? false)} disabled={format.stoppingClock} onChange={(v) => set("trackStoppage", v)}
                            info={format.stoppingClock ? "On with a clock that stops: Start/Stop stops and starts the clock." : "A clock on the watch for time to add on: Start/Stop starts and ends it, and the watch tells you the total. Off, Start/Stop opens the game menu instead."} />
                        <Switch label="Record goal scorers" checked={format.goalScorers ?? true} onChange={(v) => set("goalScorers", v)}
                            info="After a goal, the watch asks for the player's number. Off, the goal is recorded without asking. Cards always ask, so it can spot a second yellow." />
                        <Switch label="Record goal types" checked={format.goalTypes} onChange={(v) => set("goalTypes", v)}
                            info="After Goal, the watch asks Goal, DFK, Penalty or Own goal." />
                    </div>
                </div>
            </div>
        </div>
    );
}

function Switch({ label, info, checked, onChange, disabled }: { label: string; info: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
    return (
        <div className="format-switch">
            <Toggle label={label} checked={checked} onChange={onChange} disabled={disabled} />
            <InfoTip label={label}>{info}</InfoTip>
        </div>
    );
}

/** The break's name: half-time, between periods, or for one period only before extra time (SET-16). */
function breakLabel(periods: number): string {
    return periods === 2 ? "Half-time (min)" : periods === 1 ? "Break before extra time (min)" : "Break between periods (min)";
}
