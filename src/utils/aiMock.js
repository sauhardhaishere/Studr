// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date(), onStep = null) => {
  return new Promise((resolve) => {
    // Quick response by default unless web search is needed
    const lastUserLower = conversationContext.split('\n').pop()?.replace('User:', '').trim().toLowerCase() || '';
    const isHeavyTask = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("gaokao") || lastUserLower.includes("sat");

    setTimeout(async () => {
      try {
        const lower = conversationContext.toLowerCase();
        let message = "";
        let newTasks = [];
        let newActivities = [];
        let newClasses = [];

        // Extract conversation history
        const lines = conversationContext.split('\n');
        const lastUserMsg = lines.filter(l => l.startsWith('User:')).pop()?.replace('User:', '').trim() || '';
        const userCleanInput = lastUserMsg.toLowerCase();
        const lastAILine = lines.filter(l => l.startsWith('Calendly:')).pop() || '';
        const lastAILower = lastAILine.toLowerCase();

        // --- HELPER WRAPPERS ---
        const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const formatDate = (dateObj) => dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const getDayNameFromDate = (dateObj) => dateObj.toLocaleDateString('en-US', { weekday: 'long' });

        const parseTimeString = (timeStr) => {
          const match = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)?/i);
          if (!match) return null;
          let h = parseInt(match[1]);
          const m = parseInt(match[2] || "00");
          const ampm = match[3] ? match[3].toUpperCase() : (h < 9 ? 'PM' : 'AM');
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          return h + (m / 60);
        };

        const formatTimeFromDecimal = (decimal) => {
          const h = Math.floor(decimal);
          const m = Math.round((decimal - h) * 60);
          const ampm = h >= 12 ? 'PM' : 'AM';
          const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
          const displayM = m.toString().padStart(2, '0');
          return `${displayH}:${displayM} ${ampm}`;
        };

        const parseDateFromText = (text) => {
          let target = new Date(today);
          let dateFound = false;
          const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
          const monthFound = months.find(m => text.includes(m));
          const numMatch = text.match(/(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i);
          const dayNum = numMatch ? parseInt(numMatch[1]) : null;

          if (dayNum && dayNum <= 31) {
            if (monthFound) {
              const monthIdx = months.indexOf(monthFound) % 12;
              target.setMonth(monthIdx);
            }
            target.setDate(dayNum);
            if (target < today && !monthFound) target.setMonth(target.getMonth() + 1);
            dateFound = true;
          }

          if (!dateFound) {
            if (text.includes("tomorrow")) { target.setDate(today.getDate() + 1); dateFound = true; }
            else if (text.includes("today")) { dateFound = true; }
            else {
              const dow = daysOfWeek.find(d => text.includes(d));
              if (dow) {
                const todayIdx = today.getDay();
                const targetIdx = daysOfWeek.indexOf(dow);
                let diff = targetIdx - todayIdx;
                if (diff <= 0) diff += 7;
                if (text.includes("next") && diff <= 3) diff += 7;
                target.setDate(today.getDate() + diff);
                dateFound = true;
              }
            }
          }
          return dateFound ? target : null;
        };

        const getOptimalTaskTime = (date, durationHours = 1) => {
          const dStr = formatDate(date);
          const dName = getDayNameFromDate(date);
          const dayFreeRange = activities.find(s => s.isFreeSlot && (s.appliedDays?.includes(dName) || s.frequency === 'daily'));
          let start = 16, end = 20;
          if (dayFreeRange) {
            const parts = dayFreeRange.time.split(' - ');
            start = parseTimeString(parts[0]) || 16;
            end = parseTimeString(parts[1]) || 20;
          }
          return formatTimeFromDecimal(start);
        };

        const getResources = () => [
          { label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" },
          { label: "Knowt", url: "https://knowt.com" },
          { label: "Quizlet", url: "https://quizlet.com" }
        ];

        const subjectMap = ["math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "algebra", "stats", "gaokao", "sat", "act"];
        const globalExams = ["gaokao", "sat", "act", "lsat", "mcat"];

        const extractSubject = (text) => {
          const t = text.toLowerCase();
          if (t.includes("gaokao") || t.includes("gaokoa")) return "gaokao";
          return subjectMap.find(s => t.includes(s)) || null;
        };

        const sub = extractSubject(userCleanInput) || extractSubject(lastAILower) || "General";
        const classMatch = schedule && schedule.find(c => {
          const name = c.name.toLowerCase();
          const subj = (c.subject || "").toLowerCase();
          return name.includes(sub) || subj.includes(sub);
        });

        const subName = classMatch ? classMatch.name : (sub === "General" ? "Test" : sub.toUpperCase());

        const isIntensitySelection = lastAILower.includes("intensity") || lastAILower.includes("normal, moderate, or hardcore");

        // --- INTENSITY LOGIC ---
        if (isIntensitySelection) {
          const intensity = userCleanInput.includes("hard") ? "Hardcore" : (userCleanInput.includes("mod") ? "Moderate" : "Normal");
          const sessions = intensity === "Hardcore" ? 6 : (intensity === "Moderate" ? 4 : 2);
          const originalDate = parseDateFromText(conversationContext) || new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
          const deadlineStr = formatDate(originalDate);

          newTasks.push({ id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`, type: "task", priority: "high" });
          for (let i = 1; i <= sessions; i++) {
            const d = new Date(originalDate);
            d.setDate(d.getDate() - i);
            if (d >= today) {
              newTasks.push({
                id: crypto.randomUUID(), title: `${subName} Prep ${i}`, time: `${formatDate(d)}, ${getOptimalTaskTime(d)}`,
                type: "study", resources: getResources(), description: `• Focus on ${intensity} practice.`
              });
            }
          }
          return resolve({ newTasks, message: `Got it! I've built your ${intensity} study plan for the ${subName} test.` });
        }

        // --- SCHEDULING LOGIC ---
        const date = parseDateFromText(userCleanInput);
        if (date && (userCleanInput.includes("test") || userCleanInput.includes("exam") || globalExams.includes(sub))) {
          const deadlineStr = formatDate(date);
          const diffDays = Math.floor((date - today) / (1000 * 60 * 60 * 24));

          if (onStep && isHeavyTask) {
            onStep(`Searching live web for ${subName} strategies...`);
            await new Promise(r => setTimeout(r, 1200));
            onStep(`Mapping ${subName} gaps in your routine...`);
            await new Promise(r => setTimeout(r, 800));
          }

          if (diffDays > 14) {
            return resolve({ message: `I've noted your ${subName} test for ${deadlineStr}. Would you like a Normal, Moderate, or Hardcore plan?` });
          }

          newTasks.push({ id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`, type: "task", priority: "high" });
          const sessions = diffDays > 7 ? 3 : 2;
          for (let i = 1; i <= sessions; i++) {
            const d = new Date(date);
            d.setDate(d.getDate() - i);
            if (d >= today) {
              newTasks.push({
                id: crypto.randomUUID(), title: `${subName} Review ${i}`, time: `${formatDate(d)}, ${getOptimalTaskTime(d)}`,
                type: "study", resources: getResources(), description: "• Review key concepts and active recall."
              });
            }
          }
          return resolve({ newTasks, message: `I've mapped out a study plan for your ${subName} test on ${deadlineStr}.` });
        }

        resolve({ newTasks: [], message: "Hey! I'm Calendly. Ready to build a high-performance study plan?" });
      } catch (err) {
        console.error("Mock AI Error:", err);
        resolve({ newTasks: [], message: "I'm having a bit of trouble. Could you try again?" });
      }
    }, isHeavyTask ? 500 : 10);
  });
};
