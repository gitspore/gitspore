import type { Agent } from "@gitspore/shared";

// How an agent is named in the window header and the top bar: its issue, or
// "Overview" for the overview agent, which has none.
export function agentName(agent: Agent, issueTitle: string): string {
  return agent.issueNumber === null
    ? "Overview"
    : `#${agent.issueNumber} ${issueTitle}`;
}
