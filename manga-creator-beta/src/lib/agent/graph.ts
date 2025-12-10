import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state";
import { checkpointer } from "./checkpoint";
import { tools } from "./tools";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// Configure Model
// Note: We need to ensure DEEPSEEK_API_KEY is set in env
const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "sk-placeholder", // Fallback to avoid crash on build, but runtime will fail if missing
  baseURL: 'https://api.deepseek.com',
});
const model = deepseek('deepseek-chat');

/**
 * Core Agent Node
 * Uses Vercel AI SDK to handle the conversation and tool execution loop.
 */
async function callModel(state: typeof AgentState.State) {
  const { messages, project } = state;
  
  // Construct System Prompt with Project Context
  const systemPrompt = `You are a professional Manga Creation Agent (Beta Version).
Your goal is to help the user create a manga project from scratch.

Current Project Context:
- Title: ${project.title || "(Not set)"}
- Summary: ${project.summary || "(Not set)"}
- Art Style: ${project.artStyle || "(Not set)"}
- Protagonist: ${project.protagonist || "(Not set)"}
- Workflow State: ${project.workflowState}
- Scenes Count: ${project.scenes.length}

Follow the workflow:
1. Collect Basic Info (Title, Summary, Art Style, Protagonist) if missing.
2. Generate Scenes using 'generateScenes' tool.
3. Refine Scenes using 'refineScene' tool.

Always use the provided tools to modify the project state. Do not hallucinate updates.
`;

  // Call AI Model
  // maxSteps=5 allows the model to call tools and see results in a loop
  const result = await generateText({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    tools: tools,
    // @ts-expect-error - maxSteps is available in AI SDK 3.1+ but types might be lagging or strictly inferred
    maxSteps: 5,
  });

  // Return the new messages to be appended to history
  return {
    messages: result.response.messages
  };
}

// Define the Graph
export const graph = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addEdge(START, "agent")
  .addEdge("agent", END)
  .compile({ checkpointer });
