import { useState } from "react";
import { Link } from "react-router";
import { useAccountPlan } from "../api.ts";
import { formatEndsOn } from "../plans.ts";
import { Icon } from "./ui.tsx";

// PLAN-6: across the top of every page from a week before the account's plan ends, until it ends or
// is hidden on this browser (for that end: a new one shows again).

const hiddenKey = "lawfive.planNoticeHidden";
const week = 7 * 86_400_000;

export function PlanNotice() {
    const plan = useAccountPlan().data;
    const [hiddenFor, setHiddenFor] = useState(() => {
        try {
            return localStorage.getItem(hiddenKey) ?? "";
        } catch {
            return "";
        }
    });
    const endsAt = plan?.endsAt;
    if (!plan || !endsAt || hiddenFor === endsAt || Date.parse(endsAt) - Date.now() > week || Date.parse(endsAt) <= Date.now()) {
        return null;
    }
    const hide = () => {
        setHiddenFor(endsAt);
        try {
            localStorage.setItem(hiddenKey, endsAt);
        } catch {
            // Storage can be unavailable (private windows); it just comes back next time.
        }
    };
    return (
        <div className="https-notice plan-notice" role="status">
            <Icon name="plan" size={18} />
            <div className="grow">
                <strong>Your {plan.plan.name} plan ends after {formatEndsOn(plan.endsOn ?? endsAt.slice(0, 10), true)}.</strong>{" "}
                Then you're on {plan.then?.name ?? "the default plan"}, with its limits. Nothing in your account is lost.
            </div>
            <Link to="/settings#plan" className="btn btn-sm">See your plan</Link>
            <button type="button" className="icon-btn" aria-label="Hide this on this browser" title="Hide this on this browser" onClick={hide}><Icon name="close" size={16} /></button>
        </div>
    );
}
