import type { Metadata } from "next";
import ActivateAdmin from "@/components/ActivateAdmin";
export const metadata: Metadata = {
  title: "Ativar administrador",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return <ActivateAdmin />;
}
