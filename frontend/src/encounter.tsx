import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EncounterDemo } from "./ui/EncounterDemo";
import "./encounter.css";

createRoot(document.getElementById("root")!).render(<StrictMode><EncounterDemo /></StrictMode>);
