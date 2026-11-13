import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, Route, RouterProvider, Routes, createBrowserRouter } from "react-router";
import { ApiError, showSignedOut, useSession } from "./api.ts";
import { Layout } from "./components/Layout.tsx";
import { Loading } from "./components/ui.tsx";
import { CompetitionEdit, Competitions } from "./pages/Competitions.tsx";
import { MatchEdit } from "./pages/MatchEdit.tsx";
import { ResultEdit } from "./pages/ResultEdit.tsx";
import { MatchPage } from "./pages/MatchPage.tsx";
import { MatchReport } from "./pages/MatchReport.tsx";
import { SharedMatchPage } from "./pages/SharedMatch.tsx";
import { Licenses } from "./pages/Licenses.tsx";
import { HttpsGuide } from "./pages/HttpsGuide.tsx";
import { ServerSettings } from "./pages/ServerSettings.tsx";
import { MatchScreenSetup } from "./pages/MatchScreenSetup.tsx";
import { TryMatchPage } from "./pages/TryMatchPage.tsx";
import { Plans } from "./pages/Plans.tsx";
import { LinkWatch } from "./pages/Link.tsx";
import { Matches } from "./pages/Matches.tsx";
import { ImportColumns } from "./pages/ImportColumns.tsx";
import { GetApp } from "./pages/GetApp.tsx";
import { Invite } from "./pages/Invite.tsx";
import { More } from "./pages/More.tsx";
import { People } from "./pages/People.tsx";
import { RefereeDuplicates } from "./pages/RefereeDuplicates.tsx";
import { VenueDuplicates } from "./pages/VenueDuplicates.tsx";
import { RefereeEdit, RefereePage, Referees } from "./pages/Referees.tsx";
import { ForgotPassword, ResetPassword } from "./pages/ResetPassword.tsx";
import { ConfirmEmail } from "./pages/ConfirmEmail.tsx";
import { Settings } from "./pages/Settings.tsx";
import { Quiz } from "./pages/Quiz.tsx";
import { SetupWizard } from "./pages/Setup.tsx";
import { Stats } from "./pages/Stats.tsx";
import { SignIn } from "./pages/SignIn.tsx";
import { TemplateEdit, Templates } from "./pages/Templates.tsx";
import { VenueEdit, VenuePage, Venues } from "./pages/Venues.tsx";
import { Waiting } from "./pages/Waiting.tsx";
// The fonts (DESIGN.md), bundled so the app loads nothing from elsewhere; only the weights the
// styles use. Each covers several alphabets, and browsers download only the ones a page needs.
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
// WEB-24: the stadium board's figures and headings are Barlow Condensed from semibold to black,
// upright and italic.
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/barlow-condensed/900.css";
import "@fontsource/barlow-condensed/700-italic.css";
import "@fontsource/barlow-condensed/800-italic.css";
import "@fontsource/barlow-condensed/900-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";

// When the server says the session has gone (signed out on another device, the account suspended
// or deleted), go back to signing in rather than showing empty pages.
const signedOutElsewhere = (error: Error) => {
    if (error instanceof ApiError && error.status === 401 && queryClient.getQueryData(["session"])) {
        showSignedOut(queryClient);
    }
};
const queryClient: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 1, refetchOnWindowFocus: true } },
    queryCache: new QueryCache({ onError: signedOutElsewhere }),
    mutationCache: new MutationCache({ onError: signedOutElsewhere }),
});

function App() {
    const session = useSession();
    if (session.isLoading) {
        return <div className="auth-page"><Loading /></div>;
    }
    if (!session.data) {
        return (
            <Routes>
                <Route path="invite/:token" element={<Invite />} />
                <Route path="get-app" element={<GetApp />} />
                <Route path="forgot-password" element={<ForgotPassword />} />
                <Route path="reset-password/:token" element={<ResetPassword />} />
                <Route path="confirm-email/:token" element={<ConfirmEmail />} />
                <Route path="s/:token" element={<SharedMatchPage />} />
                <Route path="*" element={<SignIn />} />
            </Routes>
        );
    }
    if (session.data.user.status === "pending") {
        return <Waiting session={session.data} />;
    }
    return (
        <Routes>
            <Route path="invite/:token" element={<Invite session={session.data} />} />
            <Route path="reset-password/:token" element={<ResetPassword />} />
            <Route path="confirm-email/:token" element={<ConfirmEmail signedIn />} />
            <Route path="s/:token" element={<SharedMatchPage />} />
            <Route path="setup" element={<SetupWizard />} />
            <Route element={<Layout session={session.data} />}>
                <Route index element={<Navigate to="/matches" replace />} />
                <Route path="matches" element={<Matches />} />
                <Route path="get-app" element={<GetApp session={session.data} />} />
                <Route path="matches/new" element={<MatchEdit />} />
                <Route path="matches/import/columns" element={<ImportColumns />} />
                <Route path="matches/:id" element={<MatchPage />} />
                <Route path="matches/:id/edit" element={<MatchEdit />} />
                <Route path="matches/:id/result" element={<ResultEdit />} />
                <Route path="matches/:id/report" element={<MatchReport />} />
                <Route path="templates" element={<Templates />} />
                <Route path="templates/new" element={<TemplateEdit />} />
                <Route path="templates/:id" element={<TemplateEdit />} />
                <Route path="venues" element={<Venues />} />
                <Route path="venues/new" element={<VenueEdit />} />
                <Route path="venues/duplicates" element={<VenueDuplicates />} />
                <Route path="venues/:id" element={<VenuePage />} />
                <Route path="venues/:id/edit" element={<VenueEdit />} />
                <Route path="referees" element={<Referees />} />
                <Route path="referees/new" element={<RefereeEdit />} />
                <Route path="referees/duplicates" element={<RefereeDuplicates />} />
                <Route path="referees/:id" element={<RefereePage />} />
                <Route path="referees/:id/edit" element={<RefereeEdit />} />
                <Route path="competitions" element={<Competitions />} />
                <Route path="competitions/new" element={<CompetitionEdit />} />
                <Route path="competitions/:id" element={<CompetitionEdit />} />
                <Route path="stats" element={<Stats />} />
                <Route path="quiz" element={<Quiz />} />
                <Route path="settings" element={<Settings />} />
                <Route path="settings/licenses" element={<Licenses />} />
                {/* The British spelling it had before, still followed. */}
                <Route path="settings/licences" element={<Navigate to="/settings/licenses" replace />} />
                <Route path="settings/match-screen" element={<MatchScreenSetup />} />
                <Route path="try" element={<TryMatchPage />} />
                <Route path="settings/server" element={<ServerSettings />} />
                <Route path="settings/server/https" element={<HttpsGuide />} />
                <Route path="settings/server/plans" element={<Plans />} />
                <Route path="link" element={<LinkWatch session={session.data} />} />
                <Route path="more" element={<More />} />
                <Route path="people" element={<People />} />
                <Route path="*" element={<Navigate to="/matches" replace />} />
            </Route>
        </Routes>
    );
}

// A data router, as asking before leaving a form with changes needs one (useBlocker, APP-18).
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    </StrictMode>,
);
