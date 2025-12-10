import { Annotation } from "@langchain/langgraph";
import { CoreMessage } from "ai";
import type { ProjectState } from "@/types";

/**
 * LangGraph Agent State Definition
 */
export const AgentState = Annotation.Root({
  /**
   * The core project data (domain state)
   * Using a simple overwrite reducer for the project object, 
   * but deep merging might be safer depending on usage.
   * For now, we expect tools to update specific fields or the whole object.
   */
  project: Annotation<ProjectState>({
    reducer: (current, update) => ({
      ...current,
      ...update,
      // Ensure arrays are replaced if provided in update, or kept if not
      // This shallow merge might need refinement if partial updates to nested arrays are common
    }),
    default: () => ({
      projectId: "",
      title: "",
      summary: "",
      artStyle: "",
      protagonist: "",
      workflowState: "IDLE",
      scenes: [],
      currentSceneIndex: 0,
      canvasContent: [],
      characters: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  }),

  /**
   * Conversation history (chat messages)
   * Appends new messages to the existing list
   */
  messages: Annotation<CoreMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});
