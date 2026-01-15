// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date(), onStep = null) => {
  return new Promise((resolve) => {
    const lines = conversationContext.split('\n');
    const lastUserMsg = lines.filter(l => l.startsWith('User:')).pop()?.replace('User:', '').trim() || '';
    const userCleanInput = lastUserMsg.toLowerCase();

    // TYPO CORRECTION
    const corrections = {
      "sciecne": "science", "scence": "science", "sci": "science",
      "math": "math", "calculus": "calculus", "calclus": "calculus", "calc": "calculus",
      "history": "history", "hist": "history", "english": "english", "eng": "english",
      "biology": "biology", "bio": "biology", "chemistry": "chemistry", "chem": "chemistry",
      "spanish": "spanish", "span": "spanish", "physics": "physics", "phys": "physics"
    };

    let processedInput = userCleanInput;
    Object.keys(corrections).forEach(typo => {
      if (processedInput.includes(typo)) {
        processedInput = processedInput.replace(typo, corrections[typo]);
      }
    });

    const commonSubjects = ["math", "science", "history", "english", "spanish", "physics", "biology", "chemistry", "algebra", "geometry", "calculus", "stats", "latin"];
    const globalExams = ["gaokao", "sat", "act", "lsat", "mcat", "ap", "gre", "gmat"];

    // Fast path triggers
    const isStandardizedTest = globalExams.some(e => processedInput.includes(e));
    const isTestRequest = processedInput.includes("test") || processedInput.includes("exam") || processedInput.includes("quiz");
    const isSearchNeeded = isStandardizedTest;

    setTimeout(async () => {
      try {
        let newTasks = [];
        const lastAILine = lines.filter(l => l.startsWith('Calendly:')).pop() || '';
        const lastAILower = lastAILine.toLowerCase();

        // --- HELPERS ---
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
            if (monthFound) target.setMonth(months.indexOf(monthFound) % 12);
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

        const getOptimalTime = (date) => {
          const dName = getDayNameFromDate(date);
          const free = activities.find(s => s.isFreeSlot && (s.appliedDays?.includes(dName) || s.frequency === 'daily'));
          return formatTimeFromDecimal(free ? parseTimeString(free.time.split(' - ')[0]) || 16 : 16);
        };

        const resources = [
          { label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" },
          { label: "Knowt", url: "https://knowt.com" },
          { label: "Quizlet", url: "https://quizlet.com" }
        ];

        // --- SUBJECT & CLASS RESOLUTION ---
        const lookup = [...commonSubjects, ...globalExams].sort((a, b) => b.length - a.length);
        const subId = lookup.find(s => processedInput.includes(s)) || lookup.find(s => lastAILower.includes(s));

        const classMatch = schedule && subId && schedule.find(c => {
          const n = c.name.toLowerCase();
          const s = (c.subject || "").toLowerCase();
          return n.includes(subId) || s.includes(subId);
        });

        const name = classMatch ? classMatch.name : (subId ? subId.charAt(0).toUpperCase() + subId.slice(1) : "General");

        const date = parseDateFromText(processedInput);
        if (date && (isTestRequest || isStandardizedTest)) {
          const dStr = formatDate(date);
          const diff = Math.floor((date - today) / 86400000);

          if (onStep && isSearchNeeded) {
            onStep(`Analyzing ${name} study patterns...`);
            await new Promise(r => setTimeout(r, 1000));
          }

          if (diff > 14 && !lastAILower.includes("intensity")) {
            return resolve({ message: `I've noted your ${name} test for ${dStr}. Would you like a Normal, Moderate, or Hardcore plan?` });
          }

          const isIntensity = lastAILower.includes("intensity") || lastAILower.includes("plan?");
          const mode = isIntensity ? (processedInput.includes("hard") ? "Hardcore" : (processedInput.includes("mod") ? "Moderate" : "Normal")) : "Normal";
          const sessions = mode === "Hardcore" ? 6 : (mode === "Moderate" ? 4 : 2);

          // TASK 1: THE TEST
          newTasks.push({ id: crypto.randomUUID(), title: `${name} Test`, time: `${dStr}, 8:00 AM`, type: "task", priority: "high", description: `• Exam day.` });

          // TASKS 2+: PREP SESSIONS
          for (let i = 1; i <= sessions; i++) {
            const d = new Date(date);
            d.setDate(d.getDate() - i);
            if (d >= today) {
              const isFinal = (i === 1);
              newTasks.push({
                id: crypto.randomUUID(),
                title: `${name} ${isFinal ? 'Final Review' : 'Prep'}`,
                time: `${formatDate(d)}, ${getOptimalTime(d)}`,
                type: "study", resources,
                description: `• ${isFinal ? 'Active recall and final concept check.' : 'Focus on practice problems and note review.'}`
              });
            }
          }
          return resolve({ newTasks, message: `I've mapped out a high-performance ${mode} plan for your ${name} test on ${dStr}.` });
        }

        resolve({ newTasks: [], message: "Hey! I'm Calendly. Ready to build a high-performance study plan?" });
      } catch (err) {
        resolve({ newTasks: [], message: "I'm having a bit of trouble. Could you try again?" });
      }
    }, isSearchNeeded ? 1000 : 10);
  });
};
