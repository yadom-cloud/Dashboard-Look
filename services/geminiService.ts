import { GoogleGenAI } from "@google/genai";
import { Developer, Ticket, AvailabilityBlock } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const analyzeSchedule = async (
  developers: Developer[],
  tickets: Ticket[],
  blocks: AvailabilityBlock[]
): Promise<string> => {
  if (!apiKey) {
    return "API Key is missing. Please check your environment configuration.";
  }

  const prompt = `
    Analyze the following developer schedule and resource allocation data.
    Identify potential bottlenecks, overbooked developers, or underutilized resources.
    Suggest specific actions to optimize the workflow.
    
    Data:
    Developers: ${JSON.stringify(developers.map(d => ({ name: d.name, role: d.role })))}
    Active Tickets: ${JSON.stringify(tickets.map(t => ({ key: t.key, assignee: t.assigneeId, status: t.status, start: t.startDate, end: t.endDate })))}
    Availability Blocks (Time Off): ${JSON.stringify(blocks.map(b => ({ developer: b.developerId, type: b.type, start: b.startDate, end: b.endDate })))}

    Please provide a concise, bulleted list of insights and recommendations.
    Format the output as Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a senior technical program manager specializing in agile resource allocation.",
        temperature: 0.3,
      }
    });
    return response.text || "No insights generated.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Failed to analyze schedule. Please try again later.";
  }
};
