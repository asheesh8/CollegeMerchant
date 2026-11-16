import { storeKind } from "../lib/store.js";
import Accounts from "./Accounts.js";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Accounts storage={storeKind()} />;
}
