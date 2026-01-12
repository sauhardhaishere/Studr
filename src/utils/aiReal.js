import { simulateAIAnalysis } from "./aiMock";

/**
 * Generates a structured schedule using AI (Groq, OpenAI, or Gemini).
 * If the API call fails or no key is provided, it falls back to a smart mock analysis.
 */
export const generateScheduleFromAI = async (userInput, tasks, activities, schedule, key) => {
    // Current Date Context for the AI
    const today = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const todayStr = today.toLocaleDateString('en-US', dateOptions);

    // Build a tiny "calendar table" for the next 14 days so AI doesn't hallucinate dates
    let calendarTable = "";
    for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        calendarTable += `${d.toLocaleDateString('en-US', { weekday: 'short' })}: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${i === 0 ? " (TODAY)" : ""}\n`;
    }

    const systemPrompt = `
    You are Calendly, a high-precision academic scheduling engine. 
    
    CRITICAL: YOU MUST OPERATE USING THE INDEX SYSTEM BELOW. DO NOT USE YOUR OWN CALENDAR LOGIC.
    
    CALENDAR LOOKUP INDEX:
    ${calendarTable}
    
    1. **CLASS VERIFICATION (MANDATORY STOP CONDITION):**
       - You MUST check the 'User's Classes' list.
       - **IF NO MATCH IS FOUND** (nothing matches the name OR the category):
         - YOU MUST NOT generate any tasks.
         - Ask for the class name in a friendly way. Example: "I see you have a History test! What's the full name of your History class so I can add it to your schedule?"
       - **IF MATCHED**: Always use the formal \`name\` from the schedule (e.g., "AP Precalculus" instead of "Math").

    2. **STUDY PROTOCOL & RESOURCES:**
       - **TESTS**: Generate a multi-day plan (Test Task + 2-3 Study/Prep sessions leading up to it).
       - **RESOURCES**: For EVERY Prep/Review, you MUST include: {"label": "Study Coach (AI)", "url": "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n"}.

    3. **ZERO OVERLAP POLICY (STRICT):**
       - **NEVER** schedule two tasks at the same time (e.g., two preps at 5:00 PM).
       - Space things out (e.g., 4:00 PM, then 6:00 PM).

    4. **DATE ACCURACY:**
       - "This [Day]" (e.g., "This Wednesday") ALWAYS refers to the next coming instance of that day in the lookup index.
       - Verify the Month and Day match the index before outputting JSON.

    5. **AGENTIC TONE & PERSONALITY:**
       - Be warm, encouraging, and CLEAR. 
       - Avoid technical jargon like "**class**", "**activity**", or "**routine block**".
       - Instead of "I created an activity", say "I've added that to your schedule!"
       - **ID PRESERVATION**: If updating, ALWAYS use the existing ID from context.

    6. **TASK MODIFICATION & UPDATES:**
       - If the user says "actually move it to 5pm", identify the task and update its time while KEEPING THE SAME ID.

    7. **DYNAMIC SUBJECT HANDLING:**
       - If the user says "Change my Math class name to AP Calculus", update the class and all associated tasks in the response.
     
    8. **ROUTINE & NO REPEATS:**
       - **NO REPEATS**: If a test/exam already exists for a subject in the context, DO NOT create a new one. Ask to reschedule the existing one instead.
       - **AVAILABILITY**: Search the 'activities' context for 'isFreeSlot: true' blocks.
       - If no free slot exists, ASK for confirmation: "I've proposed 5 PM for this, is that fine? If not, what time is best for you on these days?"

    9. **NO PAST SCHEDULING (STRICT RULE):**
       - You MUST NOT generate any tasks or study sessions for dates that have already passed relative to TODAY.
       - If they mention a past event, acknowledge politely but do not schedule.

    10. **SPECIFICITY & WORK DURATION:**
        - Every task 'description' MUST start with a quantitative work requirement.
        - Example: "• Work for 45 minutes on Practice Set 1. Focus on..."

    11. **USER PREFERENCE PRIORITY:**
        - If the user says "I'm free 5-6" or "schedule it for 5pm", you MUST use that exact time window and ignore routine 'isFreeSlot' logic. Use rule 5 to save this to their routine!

    12. **FORMATTING RESPONSE (JSON ONLY):**
       {
         "message": "A warm, helpful note about what was scheduled or answered.",
         "newTasks": [],
         "newClasses": [],
         "newActivities": []
       }
    `;

    try {
        const userClassesContext = schedule.length > 0
            ? `\n\nUser's Classes:\n${schedule.map(c => `- ${c.name} (${c.subject})`).join('\n')}`
            : "";

        const userMessage = `TODAY'S TIMESTAMP: ${todayStr} ${today.toLocaleTimeString()}\n\nCALENDAR LOOKUP INDEX:\n${calendarTable}\n\nCurrent Task Context: ${JSON.stringify({ tasks, activities, schedule })}${userClassesContext}\n\nUser Message: "${userInput}"`;

        if (key && key.startsWith("gsk_")) {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                const errDetail = await response.text();
                throw new Error(`Groq Status ${response.status}: ${errDetail}`);
            }
            const data = await response.json();
            const contentString = data.choices?.[0]?.message?.content;
            if (!contentString) throw new Error("Groq returned malformed response (no content)");
            return JSON.parse(contentString);
        }

        if (key && key.startsWith("sk-")) {
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                })
            });

            if (!response.ok) throw new Error(`OpenAI Error: ${response.status}`);
            const data = await response.json();
            const contentString = data.choices?.[0]?.message?.content;
            if (!contentString) throw new Error("OpenAI returned malformed response (no content)");
            return JSON.parse(contentString);
        }

        if (key && !key.startsWith("sk-") && !key.startsWith("gsk_")) {
            const models = [
                { ver: 'v1beta', name: 'gemini-1.5-flash-latest' },
                { ver: 'v1beta', name: 'gemini-1.5-flash' },
                { ver: 'v1', name: 'gemini-pro' }
            ];

            let lastErr = "";
            for (const model of models) {
                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/${model.ver}/models/${model.name}:generateContent?key=${key}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{ text: `${systemPrompt}\n\n${userMessage}` }]
                            }],
                            generationConfig: {
                                responseMimeType: "application/json",
                                temperature: 0.1
                            }
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) return JSON.parse(text);
                    } else {
                        lastErr = await response.text();
                    }
                } catch (e) {
                    lastErr = e.message;
                }
            }
            throw new Error(`Gemini All Models Failed: ${lastErr}`);
        }

        // --- FALLBACK TO MOCK ---
        throw new Error("No valid API key provided or API calls failed.");

    } catch (error) {
        console.warn("AI Connection Failed, using Mock:", error.message);
        return await simulateAIAnalysis(userInput, tasks, activities, schedule, today);
    }
};
