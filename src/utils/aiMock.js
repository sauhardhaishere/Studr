// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date()) => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      const lower = conversationContext.toLowerCase();
      let message = "";
      let newTasks = [];
      let newActivities = [];
      let newClasses = [];

      // Extract conversation history
      const lines = conversationContext.split('\n');
      const lastUserMsg = lines.filter(l => l.startsWith('User:')).pop()?.replace('User:', '').trim() || '';
      const lastUserLower = lastUserMsg.toLowerCase();
      const lastAILine = lines.filter(l => l.startsWith('Calendly:')).pop() || '';
      const lastAILower = lastAILine.toLowerCase();

      // --- DYNAMIC DATE CALCULATOR ---
      const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const dayTypos = {
        "thurs": "thursday", "thur": "thursday", "thrudsay": "thursday", "thrusday": "thursday",
        "tues": "tuesday", "tuseday": "tuesday", "wednes": "wednesday", "wenesday": "wednesday", "wed": "wednesday", "weds": "wednesday",
        "mon": "monday", "fri": "friday", "sat": "saturday", "sun": "sunday"
      };

      const getDayOffset = (targetDayName, isNext) => {
        const todayIdx = today.getDay();
        const targetIdx = daysOfWeek.indexOf(targetDayName.toLowerCase());
        if (targetIdx === -1) return 3;
        let diff = targetIdx - todayIdx;
        if (diff < 0) diff += 7;
        if (diff === 0 && !lastUserLower.includes("today")) diff = 7;
        if (isNext) diff += 7;
        return diff;
      };

      const formatDate = (dateObj) => dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const getDayNameFromDate = (dateObj) => dateObj.toLocaleDateString('en-US', { weekday: 'long' });

      // --- SMART TIME PARSER ---
      const parseUserTime = (text) => {
        const rangeMatch = text.match(/(\d+)\s*(-|to|until)\s*(\d+)\s*(am|pm)?/i);
        const singleMatch = text.match(/(\d+):?(\d+)?\s*(am|pm)/i) || text.match(/(\d+)\s*(pm|am)/i);
        if (rangeMatch) {
          const startH = parseInt(rangeMatch[1]);
          return { start: `${startH}:00 ${(rangeMatch[4] || 'PM').toUpperCase()}`, hour: startH };
        }
        if (singleMatch) {
          const h = parseInt(singleMatch[1]);
          const ampm = (singleMatch[3] || 'PM').toUpperCase();
          return { start: `${h}:${singleMatch[2] || "00"} ${ampm}`, hour: h };
        }
        return null;
      };

      const userTimePref = parseUserTime(lastUserLower);

      // --- DATE PARSING ---
      let targetDeadline = new Date(today);
      let offset = 3;
      let dateParsed = false;
      if (lastUserLower.includes("tomorrow")) { offset = 1; dateParsed = true; }
      else if (lastUserLower.includes("today")) { offset = 0; dateParsed = true; }
      else {
        let foundDay = daysOfWeek.find(d => lastUserLower.includes(d));
        if (!foundDay) {
          const typoKey = Object.keys(dayTypos).find(t => lastUserLower.includes(t));
          if (typoKey) foundDay = dayTypos[typoKey];
          else if (lastUserLower.includes("wen")) foundDay = "wednesday";
        }
        if (foundDay) {
          offset = getDayOffset(foundDay, lastUserLower.includes("next"));
          dateParsed = true;
        }
      }
      targetDeadline.setDate(today.getDate() + offset);

      // --- SUBJECT DETECTION ---
      const subjectMap = ["math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "precalc", "algebra", "geometry", "stats", "science", "ap"];
      const foundSubjects = subjectMap.filter(s => lastUserLower.includes(s));
      const uniqueSubjects = [...new Set(foundSubjects)];

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");
      const hasTaskMention = isTest || isAssignment;

      // --- AGENTIC MEMORY: Handling class creation replies ---
      const isAnsweringClassName = lastAILower.includes('full name of that class') || lastAILower.includes("full name of your");

      if (isAnsweringClassName && lastUserMsg.length > 1 && !hasTaskMention) {
        // AI: "What's the full name?" -> User: "Spanish 3"
        // 1. Create the class
        const subjectFromPrevious = lines.reverse().find(l => subjectMap.some(s => l.toLowerCase().includes(s))) || "General";
        const subjectFound = subjectMap.find(s => subjectFromPrevious.toLowerCase().includes(s)) || "General";
        const subCategory = subjectFound.charAt(0).toUpperCase() + subjectFound.slice(1);

        const newClass = { id: crypto.randomUUID(), name: lastUserMsg, subject: subCategory };
        newClasses = [newClass];

        return resolve({
          newTasks: [],
          newClasses,
          message: `Got it! I've added **${lastUserMsg}** to your schedule. Now, did you want to schedule that ${subjectFound} test for this Wednesday or a different day?`
        });
      }

      // --- MAIN SCHEDULING LOGIC ---
      const matchedClasses = uniqueSubjects.map(s => schedule && schedule.find(c => c.name.toLowerCase().includes(s) || (c.subject && c.subject.toLowerCase().includes(s))));

      if (hasTaskMention && uniqueSubjects.length > 0 && matchedClasses.every(c => !c)) {
        return resolve({ newTasks: [], message: `I see you have a ${uniqueSubjects[0]} test! What's the full name of that class in your schedule?` });
      }

      // --- STUDY HELPER COACHING ---
      const getStudyAdvice = (sub, stage) => {
        const s = sub.toLowerCase();
        if (stage === 'final') {
          if (s.includes('math') || s.includes('calc')) return "• Work for 60 minutes. Complete a full practice test under timed conditions. Review your 'error log'.";
          if (s.includes('bio') || s.includes('science')) return "• Work for 60 minutes. Self-quiz on diagrams. Explain complex cycles out loud.";
          return "• Work for 60 minutes. Conduct a mock exam. Use active recall on every key concept.";
        } else {
          if (s.includes('math') || s.includes('calc')) return "• Work for 45 minutes. Create a one-page formula sheet. Solve 10 challenge problems.";
          if (s.includes('bio') || s.includes('science')) return "• Work for 45 minutes. Transform notes into a concept map. Define all vocab terms.";
          return "• Work for 45 minutes. Condense notes into a study guide. Outline 5 likely essay topics.";
        }
      };

      const getResources = (isReview = false) => {
        const res = [{ label: "Quizlet", url: "https://quizlet.com" }];
        if (isReview) res.push({ label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" });
        return res;
      };

      // --- AVAILABILITY LOOKUP ---
      const routineBlocks = activities || [];
      const freeSlots = routineBlocks.filter(b => b.isFreeSlot);
      const findFreeSlotForDay = (date) => {
        const dName = getDayNameFromDate(date);
        return freeSlots.find(s => s.appliedDays && s.appliedDays.includes(dName)) || freeSlots.find(s => s.frequency === 'daily');
      };

      const usedSlotsByDay = {};
      const getOptimalTaskTime = (date, preferHourManual = null) => {
        const dayKey = formatDate(date);
        if (!usedSlotsByDay[dayKey]) usedSlotsByDay[dayKey] = [];
        if (preferHourManual !== null) {
          let targetH = preferHourManual;
          while (usedSlotsByDay[dayKey].includes(targetH)) targetH++;
          usedSlotsByDay[dayKey].push(targetH);
          const ampm = targetH >= 12 ? "PM" : "AM";
          return `${targetH > 12 ? targetH - 12 : (targetH === 0 ? 12 : targetH)}:00 ${ampm}`;
        }
        const freeSlot = findFreeSlotForDay(date);
        if (freeSlot) {
          const match = freeSlot.time.split(' - ')[0].match(/(\d+):?(\d+)?\s*(AM|PM)/i);
          if (match) {
            let h = parseInt(match[1]);
            const ampm = match[3].toUpperCase();
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            while (usedSlotsByDay[dayKey].includes(h)) h++;
            usedSlotsByDay[dayKey].push(h);
            return `${h > 12 ? h - 12 : (h === 0 ? 12 : h)}:00 ${h >= 12 ? 'PM' : 'AM'}`;
          }
        }
        let fallbackH = 16;
        while (usedSlotsByDay[dayKey].includes(fallbackH)) fallbackH++;
        usedSlotsByDay[dayKey].push(fallbackH);
        return `${fallbackH > 12 ? fallbackH - 12 : fallbackH}:00 PM`;
      };

      if (hasTaskMention && uniqueSubjects.length > 0) {
        const subClass = matchedClasses.find(c => c) || { name: uniqueSubjects[0].charAt(0).toUpperCase() + uniqueSubjects[0].slice(1) };
        const subName = subClass.name;
        const deadlineStr = formatDate(targetDeadline);

        if (isAssignment) {
          const t = getOptimalTaskTime(targetDeadline, userTimePref ? userTimePref.hour : null);
          newTasks = [{
            id: crypto.randomUUID(), title: `${subName} Work`, time: `${deadlineStr}, ${t}`,
            duration: "45m", type: "study", priority: "medium",
            description: `• Work for 45 minutes on ${subName}.`, resources: getResources(true)
          }];
          return resolve({ newTasks, message: `Alright! I've added that ${subName} assignment for ${t} on ${deadlineStr}.` });
        } else if (isTest) {
          newTasks.push({
            id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`,
            type: "task", priority: "high", description: `• Exam day for ${subName}.`, resources: getResources(false)
          });
          for (let i = 1; i <= 2; i++) {
            const d = new Date(targetDeadline); d.setDate(d.getDate() - i);
            if (d >= today) {
              const t = getOptimalTaskTime(d, userTimePref ? userTimePref.hour : null);
              const stage = i === 1 ? 'final' : 'prep';
              newTasks.push({
                id: crypto.randomUUID(), title: `${subName} ${i === 1 ? 'Review' : 'Prep'}`, time: `${formatDate(d)}, ${t}`,
                duration: i === 1 ? "1h" : "45m", type: "study", priority: "medium",
                description: getStudyAdvice(subName, stage), resources: getResources(true)
              });
            }
          }
          return resolve({ newTasks, message: `Got it! I've mapped out a specific study plan for your ${subName} test on ${deadlineStr}.` });
        }
      }

      resolve({ newTasks: [], message: "Hey! I'm Calendly. Ready to build a high-performance study plan?" });
    }, 800);
  });
};
