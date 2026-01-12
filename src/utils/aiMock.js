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

      // --- DATE PARSING LOGIC ---
      const parseDateFromText = (text) => {
        let target = new Date(today);
        let dateFound = false;
        if (text.includes("tomorrow")) { target.setDate(today.getDate() + 1); dateFound = true; }
        else if (text.includes("today")) { dateFound = true; }
        else {
          let foundDay = daysOfWeek.find(d => text.includes(d));
          if (!foundDay) {
            const typoKey = Object.keys(dayTypos).find(t => text.includes(t));
            if (typoKey) foundDay = dayTypos[typoKey];
            else if (text.includes("wen")) foundDay = "wednesday";
          }
          if (foundDay) {
            const offset = getDayOffset(foundDay, text.includes("next"));
            target.setDate(today.getDate() + offset);
            dateFound = true;
          }
        }
        return dateFound ? target : null;
      };

      const targetDeadline = parseDateFromText(lastUserLower) || new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

      // --- SUBJECT DETECTION ---
      const subjectMap = ["math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "precalc", "algebra", "geometry", "stats", "science", "ap"];
      const foundSubjects = subjectMap.filter(s => lower.includes(s));
      const uniqueSubjects = [...new Set(foundSubjects)];

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz") || lower.includes("test");
      const hasTaskMention = isTest || isAssignment;

      // --- AGENTIC MEMORY ---
      const isAnsweringClassName = lastAILower.includes('full name of that class') || lastAILower.includes("full name of your");
      const isNegotiatingTime = lastAILower.includes('conflict') || lastAILower.includes('is that fine') || lastAILower.includes('what time works');

      if (isAnsweringClassName && lastUserMsg.length > 1 && !hasTaskMention) {
        const subjectFound = subjectMap.find(s => lower.includes(s)) || "General";
        const subCategory = subjectFound.charAt(0).toUpperCase() + subjectFound.slice(1);
        const newClass = { id: crypto.randomUUID(), name: lastUserMsg, subject: subCategory };
        newClasses = [newClass];
        return resolve({
          newTasks: [],
          newClasses,
          message: `Awesome! I've added **${lastUserMsg}** to your schedule. Should I go ahead and schedule that study plan for this week?`
        });
      }

      // --- SMART TIME SLOTTING WITH CONFLICT DETECTION ---
      const routineBlocks = activities || [];
      const freeSlots = routineBlocks.filter(b => b.isFreeSlot);
      const allExistingTasks = currentTasks || [];

      const getSlotWithConflictCheck = (date) => {
        const dStr = formatDate(date);
        const dName = getDayNameFromDate(date);
        const slot = freeSlots.find(s => s.appliedDays?.includes(dName)) || freeSlots.find(s => s.frequency === 'daily');

        let proposedH = 16; // 4 PM
        if (slot) {
          const m = slot.time.match(/(\d+)/);
          if (m) proposedH = parseInt(m[1]) + (slot.time.includes('PM') && parseInt(m[1]) < 12 ? 12 : 0);
        }

        // Check against existing tasks
        const hasConflict = allExistingTasks.some(t => t.time.includes(dStr) && t.time.includes(`${proposedH > 12 ? proposedH - 12 : (proposedH === 0 ? 12 : proposedH)}:00`));

        return { hour: proposedH, hasConflict, displayTime: `${proposedH > 12 ? proposedH - 12 : (proposedH === 0 ? 12 : proposedH)}:00 ${proposedH >= 12 ? 'PM' : 'AM'}` };
      };

      // --- MAIN SCHEDULING LOGIC ---
      const primarySubject = uniqueSubjects[0];
      const classRes = schedule && schedule.find(c => c.name.toLowerCase().includes(primarySubject) || (c.subject && c.subject.toLowerCase().includes(primarySubject)));

      if (hasTaskMention && !classRes) {
        return resolve({ newTasks: [], message: `I see you have a ${primarySubject} test! What's the full name of that class in your schedule?` });
      }

      if (hasTaskMention && classRes) {
        const subName = classRes.name;
        const deadlineStr = formatDate(targetDeadline);
        let foundConflict = false;
        let conflictDay = "";

        if (isTest) {
          newTasks.push({
            id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`,
            type: "task", priority: "high", description: `• Exam day for ${subName}.`, resources: [{ label: "Quizlet", url: "https://quizlet.com" }]
          });

          for (let i = 1; i <= 2; i++) {
            const d = new Date(targetDeadline); d.setDate(d.getDate() - i);
            if (d >= today) {
              const slotInfo = getSlotWithConflictCheck(d);
              if (slotInfo.hasConflict) {
                foundConflict = true;
                conflictDay = getDayNameFromDate(d);
              }
              newTasks.push({
                id: crypto.randomUUID(), title: `${subName} ${i === 1 ? 'Review' : 'Prep'}`, time: `${formatDate(d)}, ${slotInfo.displayTime}`,
                duration: "1h", type: "study", priority: "medium",
                description: i === 1 ? `• Timed practice test for ${subName}.` : `• Concept mapping for ${subName}.`,
                resources: [{ label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" }]
              });
            }
          }

          if (foundConflict) {
            return resolve({
              newTasks: [], // Stop until we confirm time
              message: `I noticed a conflict on **${conflictDay}** — you already have something scheduled during your usual study time. What time works best for you to study for **${subName}** that day?\n\n*Pro-tip: Fill out your full class schedule and routine blocks to help me avoid these overlaps!*`
            });
          }

          return resolve({ newTasks, message: `Perfect! I've mapped out a high-performance study plan for your **${subName}** test on ${deadlineStr}. You're going to crush it!` });
        }
      }

      resolve({ newTasks: [], message: "Hey there! I'm Calendly. Ready to build a high-performance study plan?" });
    }, 800);
  });
};
