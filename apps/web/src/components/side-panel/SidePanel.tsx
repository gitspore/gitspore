import { mockAgents, mockIssues } from "@/lib/mock";
import AgentRow from "./AgentRow";

// The side panel, Agents tab.
export default function SidePanel() {
  return (
    <div className="flex flex-col gap-1">
      {mockAgents.map((agent) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          issueTitle={
            mockIssues.find((i) => i.number === agent.issueNumber)?.title ?? ""
          }
        />
      ))}
    </div>
  );
}
