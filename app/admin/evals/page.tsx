import { evalFixture } from "../../../lib/evals";
import EvalDashboard from "./eval-dashboard";

export const metadata = {
  title: "Validation dashboard | WhyDidThisTrialFail",
  robots: { index: false, follow: false },
};

export default function EvalDashboardPage() {
  return <EvalDashboard fixture={evalFixture} />;
}
