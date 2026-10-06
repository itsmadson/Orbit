import { SettingsView } from "@/features/settings/settings";
import { pageTitle } from "@/lib/page-title";
export const generateMetadata = pageTitle("nav.settings");
export default function Page() {
  return <SettingsView />;
}
