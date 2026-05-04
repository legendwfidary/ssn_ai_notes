import { GoogleGenAI, Type } from "@google/genai";
import { StudyGuide, PipelineStep } from "../types";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || '' 
});

export async function processAudio(
  audioBase64: string, 
  mimeType: string,
  onProgress: (step: PipelineStep, message: string) => void
): Promise<StudyGuide> {
  const model = "gemini-3-flash-preview";

  try {
    // 1. Transcription & Cleaning
    onProgress(PipelineStep.TRANSCRIBING, "Transcribing audio and cleaning text...");
    const transcriptionResponse = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: "Transcript this lecture audio accurately. Remove filler words (um, ah, like) and normalize the text for clarity. Return ONLY the cleaned transcript text." },
            { inlineData: { data: audioBase64, mimeType } }
          ]
        }
      ]
    });
    const transcript = transcriptionResponse.text || "";

    return await processText(transcript, onProgress);
  } catch (error) {
    console.error("Gemini Audio Error:", error);
    throw error;
  }
}

export async function processText(
  rawText: string,
  onProgress: (step: PipelineStep, message: string) => void
): Promise<StudyGuide> {
  const model = "gemini-3-flash-preview";

  try {
    // 2. Structuring & NLP Processing
    onProgress(PipelineStep.STRUCTURING, "Analyzing topics and structuring notes...");
    
    // We'll use structured output to get a clean JSON back
    const response = await ai.models.generateContent({
      model,
      contents: `Perform a complete analysis of the following lecture material. 
      Input text: "${rawText}"
      
      Tasks:
      1. Detect the main title of the lecture.
      2. Identify key topics and subtopics (hierarchical).
      3. Extract the most important key takeaways (5-10 items).
      4. Create a concise summary (2-3 paragraphs).
      5. Generate at least 5 active recall flashcards (Question & Answer pairs).
      
      Return the output as a valid JSON object matching this schema:
      {
        "title": "string",
        "summary": "string",
        "keyTakeaways": ["string"],
        "structuredNotes": [{ "title": "string", "content": "string", "subtopics": [...] }],
        "flashcards": [{ "question": "string", "answer": "string" }]
      }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
            structuredNotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING },
                  subtopics: {
                    type: Type.ARRAY,
                    items: {
                       type: Type.OBJECT,
                       properties: {
                         title: { type: Type.STRING },
                         content: { type: Type.STRING }
                       }
                    }
                  }
                },
                required: ["title", "content"]
              }
            },
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ["question", "answer"]
              }
            }
          },
          required: ["title", "summary", "keyTakeaways", "structuredNotes", "flashcards"]
        }
      }
    });

    onProgress(PipelineStep.COMPLETED, "Study material ready!");
    return JSON.parse(response.text || "{}") as StudyGuide;

  } catch (error) {
    console.error("Gemini Processing Error:", error);
    throw error;
  }
}
