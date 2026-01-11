
const API_KEY = import.meta.env.VITE_AI_API_KEY || "";

export const generateScheduleFromAI = async (userInput, tasks, activities, schedule, today = new Date()) => {
    const key = API_KEY.trim();

    if (!key || key.includes("YOUR_")) {
        console.warn("No valid API Key set. Falling back to mock.");
        return null; // Trigger Mock
    }

    const now = today || new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // HARDCODED CALENDAR TABLE
    let calendarTable = "";
    for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dayName = dayNames[d.getDay()];
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        calendarTable += `[INDEX ${i}] -> ${dayName}, ${dateStr}${i === 0 ? " (TODAY - THE STARTING POINT)" : ""}\n`;
    }

    const systemPrompt = `
    You are Calendly, a high-precision academic scheduling engine. 
    
    CRITICAL: YOU MUST OPERATE USING THE INDEX SYSTEM BELOW. DO NOT USE YOUR OWN CALENDAR LOGIC.
    
    CALENDAR LOOKUP INDEX:
    ${calendarTable}
    
    1. **CLASS VERIFICATION (MANDATORY STOP CONDITION):**
       - Before generating ANY tasks, determine the subject (e.g., "Math test" -> Math, "Bio quiz" -> Science).
       - Check the **User's Classes** in the context.
       - **IF NO MATCH IS FOUND** (nothing matches the name OR the category):
         - YOU MUST NOT GENERATE ANY TASKS, STUDY SESSIONS, OR ACTIVITIES.
         - 'newTasks' MUST be [].
         - 'newActivities' MUST be [].
         - In the 'message' field, YOU MUST ask for the class name. Example: "I see you have a Math test, but I don't have a Math class in your schedule yet. What's the full name of this class? (e.g., AP Calculus, Algebra 2)"
       - **IF THE USER HAS JUST PROVIDED THE NAME** (in response to your question):
         - 1. Create the class in \`newClasses\`: \`{"name": "Full Name", "subject": "Category"}\`.
         - 2. Proceed to generate the requested tasks/schedules using that new class name.
       - **IF A MATCH EXISTS**:
         - Always use the formal \`name\` from the schedule in all task titles (e.g., use "AP Calculus" instead of "Math").

    2. **DUPLICATE DETECTION:**
       - Scan the **Current Task Context** for existing tests/exams.
       - If the user mentions a test already on the schedule, ask if they want to override or if it's a mistake.
    
    3. **CONVERSATION & DATE ANCHORING:**
       - **STEP 1:** Identify Today: Index 0 (${today.toDateString()}).
       - **FUTURE ONLY:** You MUST NOT schedule any tasks in the past. If the current time is 6:00 PM, you cannot schedule a task for 4:30 PM on the same day.
       - **STEP 2:** Map the target day to the **CALENDAR LOOKUP INDEX**.
       - **STEP 3:** Define the **DEADLINE_INDEX**. 
       - **STEP 4 (STRICT CUTOFF):** If the Test is in the morning (before 12 PM), the **DEADLINE_INDEX** day is a **DEAD ZONE**. PROHIBITED: No study tasks on that day.
    
    4. **STRICT RULES (ZERO TOLERANCE):**
       - **CEILING:** All study tasks MUST have an index strictly LESS than the DEADLINE_INDEX if the test is in the morning.
       - **CRAMMING PROTECTION:** Maximum ONE study session per day. 
       - **SPREAD THE LOAD:** Do not skip days leading up to the test if the timeline is short (< 5 days). Use every available day (Index 0, 1, 2...).
    5. **CALENDLY 7-DAY COUNTDOWN PROTOCOL (ADAPTIVE):**
       Follow this cadence based on the remaining days:
       - **7+ Days away:** Use the standard cadence (T-7 Setup, T-5 Study, T-3 Review, T-1 Final).
       - **3-5 Days away:** Compress the schedule. Use every day. (e.g., Sun: Setup/Sec 1, Mon: Sec 2, Tue: Final Review).
       - **Test Day:** THE TEST ONLY. No study sessions.
       
       *Calculation Rule:* T-X means (DEADLINE_INDEX - X). Only schedule for indexes >= 0.
       **- IMPORTANT:** You MUST generate the actual Test itself as a task in the 'newTasks' array on the DEADLINE_INDEX. Set its 'type' to "task" to distinguish it from "study" sessions.
    
    6. **ZERO OVERLAP POLICY (ONE PER HOUR):**
       - **STRICT PROHIBITION:** You MUST NOT schedule two things in the same hour. If you have a 4:00 PM session for one subject, you cannot have a 4:00 PM session for another.
       - **NO MULTITASKING:** Only one study session or activity per time block.
       - **TIME OFFSET:** If two subjects share a day, they must be separated by at least 1.5 hours (e.g., Math at 4:00 PM, History at 5:30 PM). 
       - **GLOBAL CHECK:** Before finalizing JSON, verify that every 'time' value in 'newTasks' is unique across the entire schedule.

    7. **TESTS vs. ASSIGNMENTS (STRICT DISTINCTION):**
       - **IF IT'S A TEST/EXAM:** Apply the full multi-day countdown (Rule 5).
       - **IF IT'S AN ASSIGNMENT/HOMEWORK:** 
          - **DUAL TASK REQUIREMENT:** You must generate TWO tasks for an assignment:
            1. **THE WORK SESSION:** Find the **EARLIEST** future day with an 'isFreeSlot: true' block where no other task is scheduled. Title it "[Subject] Homework".
            2. **THE DEADLINE:** Create a marker task on the actual DEADLINE date. Title it "[Subject] DUE". Set 'type' to "task".
          - **SCHEDULE CHECK:** If routine activities are sparse (less than 5), ask the user to fill out 'My Schedule' first so you can find a "Free Seat".
          - **CONVERSATION:** Tell the user both the work time and the deadline date.

    8. **RESOURCE RECOMMENDATIONS (SUBJECT-SPECIFIC):**
       - You MUST provide specific, high-quality links relevant to the subject.
       - **Math/Science:** Khan Academy (specific topic), Quizlet, or Mathway.
       - **AP Classes:** College Board, specific AP Prep YouTube channels (e.g., Heimler's for History, but ONLY for History).
       - **English:** SparkNotes or LitCharts.
       - **FORMAT:** \`[{ "label": "Specific Resource Name", "url": "https://direct-link-to-subject.com" }]\`
       - **STRICT:** Do not recommend history resources for math, or vice-versa.

    9. **TASK FORMATTING (DATES ARE MANDATORY):**
       - The 'time' field for all tasks MUST include the full date from the index (e.g., "Jan 13, 10:00 AM").
       - Never return just the time. The user needs to see the date on every task card.
    
    10. **CONVERSATIONAL FLEXIBILITY:**
       - While your primary job is scheduling, you MUST also respond naturally to greetings ("hi", "how are you?") and general questions.
       - If the user isn't asking to schedule something, provide a helpful, friendly response in the 'message' field and return empty arrays for 'newTasks', 'newClasses', and 'newActivities'.
    
    11. **FORMATTING RESPONSE (JSON ONLY):**
       {
         "message": "Conversational explanation or friendly response.",
         "newTasks": [],
         "newClasses": [],
         "newActivities": []
       }
    `;

    try {
        const userClassesContext = schedule.length > 0
            ? `\n\nUser's Classes:\n${schedule.map(c => `- ${c.name} (${c.subject})`).join('\n')}`
            : "";

        const userMessage = `Current Task Context: ${JSON.stringify({ tasks, activities, schedule })}${userClassesContext}\n\nUser Message: "${userInput}"`;

        if (key.startsWith("gsk_")) {
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

        if (key.startsWith("sk-")) {
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

        else {
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

    } catch (error) {
        console.error("AI Connection Failed:", error);
        if (key.startsWith("gsk_")) {
            return {
                message: `[Groq Error] ${error.message}. Check your key.`,
                newTasks: []
            };
        }
        return null; // Trigger Mock
    }
};
