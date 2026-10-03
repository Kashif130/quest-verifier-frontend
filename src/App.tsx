import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastViewport } from "./components/ui";
import { Landing } from "./pages/Landing";
import { Quests } from "./pages/Quests";
import { QuestDetail } from "./pages/QuestDetail";
import { CreateQuest } from "./pages/CreateQuest";
import { Dashboard } from "./pages/Dashboard";
import { Moderation } from "./pages/Moderation";
import { NotFound } from "./pages/NotFound";

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/quests" element={<Quests />} />
          <Route path="/quests/:id" element={<QuestDetail />} />
          <Route path="/create" element={<CreateQuest />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/moderation" element={<Moderation />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <ToastViewport />
    </>
  );
}
