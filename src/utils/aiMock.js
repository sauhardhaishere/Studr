// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date()) => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      const lower = conversationContext.toLowerCase();
      let message = "";
      let newTasks = [];
      let newActivities = [];

      // Extract conversation history
      const lines = conversationContext.split('\n');
      const lastUserMsg = lines.filter(l => l.startsWith('User:')).pop()?.replace('User:', '').trim() || '';
      const lastUserLower = lastUserMsg.toLowerCase();
      const lastAILine = lines.filter(l => l.startsWith('Calendly:')).pop() || '';
      const lastAILower = lastAILine.toLowerCase();

      // --- DYNAMIC DATE CALCULATOR ---
      const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

      const getDayOffset = (targetDayName, isNext) => {
        const todayIdx = today.getDay();
        const targetIdx = daysOfWeek.indexOf(targetDayName.toLowerCase());
        if (targetIdx === -1) return 3;
        let diff = targetIdx - todayIdx;
        if (diff < 0) diff += 7;
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
          const endH = parseInt(rangeMatch[3]);
          let ampm = (rangeMatch[4] || 'PM').toUpperCase();
          return { start: `${startH}:00 ${ampm}`, end: `${endH}:00 ${ampm}`, full: `${startH}:00 ${ampm} - ${endH}:00 ${ampm}` };
        }
        if (singleMatch) {
          const h = parseInt(singleMatch[1]);
          const m = singleMatch[2] || "00";
          const ampm = (singleMatch[3] || 'PM').toUpperCase();
          return { start: `${h}:${m} ${ampm}`, end: `${h + 1}:${m} ${ampm}`, full: `${h}:${m} ${ampm}` };
        }
        return null;
      };

      const userTimePref = parseUserTime(lastUserLower);

      // --- DATE PARSING ---
      let targetDeadline = new Date(today);
      let offset = 3;
      let dateParsed = false;
      const monthMatch = months.find(m => lastUserLower.includes(m));
      if (monthMatch) {
        const monthIdx = months.indexOf(monthMatch);
        const dateMatch = lastUserLower.match(new RegExp(`${monthMatch}\\s*(\\d+)`));
        if (dateMatch) {
          const dayNum = parseInt(dateMatch[1]);
          targetDeadline = new Date(today.getFullYear(), monthIdx, dayNum);
          if (targetDeadline < today && !lastUserLower.includes("last") && !lastUserLower.includes("yesterday")) {
            targetDeadline.setFullYear(today.getFullYear() + 1);
          }
          dateParsed = true;
          offset = Math.round((targetDeadline - today) / (1000 * 60 * 60 * 24));
        }
      }
      if (!dateParsed) {
        if (lastUserLower.includes("tomorrow")) offset = 1;
        else if (lastUserLower.includes("today")) offset = 0;
        else if (lastUserLower.includes("yesterday")) offset = -1;
        else {
          const foundDay = daysOfWeek.find(d => lastUserLower.includes(d));
          if (foundDay) offset = getDayOffset(foundDay, lastUserLower.includes("next"));
          else offset = 1;
        }
        targetDeadline.setDate(today.getDate() + offset);
      }

      // --- SUBJECT DETECTION ---
      const subjectMap = ["math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "precalc", "algebra", "geometry", "stats", "science", "ap"];
      const foundSubjects = subjectMap.filter(s => lastUserLower.includes(s));
      const uniqueSubjects = [...new Set(foundSubjects)];
      const displayNames = uniqueSubjects.map(s => {
        const matchingClass = schedule && schedule.find(c => c.name.toLowerCase().includes(s) || (c.subject && c.subject.toLowerCase().includes(s)));
        return matchingClass ? matchingClass.name : null;
      });

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lastUserLower.includes("due");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");
      const hasTaskMention = isTest || isAssignment || lastUserLower.includes("review") || lastUserLower.includes("study");

      // --- AVAILABILITY LOGIC ---
      const routineBlocks = activities || [];
      const freeSlots = routineBlocks.filter(b => b.isFreeSlot);

      const findFreeSlotForDay = (targetDate) => {
        const dayName = getDayNameFromDate(targetDate);
        return freeSlots.find(s => s.appliedDays && s.appliedDays.includes(dayName)) || freeSlots.find(s => s.frequency === 'daily');
      };

      // Conversational State
      const isAnsweringAvailability = lastAILower.includes('is that fine') || lastAILower.includes('what time is best') || lastAILower.includes('fill out your daily routine');

      // 1. Handle "Yes" to proposed time
      if (isAnsweringAvailability && (lastUserLower === 'yes' || lastUserLower.includes('yes that') || lastUserLower.includes('that works'))) {
        // Look for the previously proposed time in AI message
        const timeMatch = lastAILine.match(/(\d+):?(\d+)?\s*(AM|PM)/i);
        const proposedTime = timeMatch ? timeMatch[0] : "4:00 PM";

        const subject = uniqueSubjects[0] || "General";
        const subProper = subject.charAt(0).toUpperCase() + subject.slice(1);
        const dateStr = formatDate(targetDeadline);

        newTasks = [{
          id: crypto.randomUUID(),
          title: `${subProper} Session`,
          time: `${dateStr}, ${proposedTime}`,
          duration: "1h", type: "study", priority: "medium",
          description: `• Work for 60 minutes. focus on practice and logic.`,
          resources: [{ label: "Quizlet", url: "https://quizlet.com" }]
        }];

        return resolve({ newTasks, newClasses: [], newActivities: [], message: `Excellent! I've scheduled your **${subProper}** session for **${proposedTime}**. I'll remember you're free then!` });
      }

      // 2. Handle specific time preference ("No, 5-6 PM is better")
      if (isAnsweringAvailability && userTimePref) {
        const subject = uniqueSubjects[0] || "General";
        const subProper = subject.charAt(0).toUpperCase() + subject.slice(1);
        const dateStr = formatDate(targetDeadline);
        const dayName = getDayNameFromDate(targetDeadline);

        // Task for now
        newTasks = [{
          id: crypto.randomUUID(),
          title: `${subProper} Session`,
          time: `${dateStr}, ${userTimePref.start}`,
          duration: "1h", type: "study", priority: "medium",
          description: `• Work for 60 minutes on ${subProper}.`,
          resources: [{ label: "Quizlet", url: "https://quizlet.com" }]
        }];

        // Routine block for FUTURE
        newActivities = [{
          id: crypto.randomUUID(),
          title: "Study Slot",
          time: userTimePref.full || `${userTimePref.start} - ${userTimePref.end}`,
          frequency: "weekly",
          appliedDays: [dayName],
          isFreeSlot: true
        }];

        return resolve({
          newTasks,
          newActivities,
          newClasses: [],
          message: `Got it! I've scheduled your **${subProper}** for **${userTimePref.start}** and saved this as a new **Free Slot** in your routine for ${dayName}s. I'll use this time in the future!`
        });
      }

      // --- MAIN SCHEDULING FLOW ---
      if (hasTaskMention && uniqueSubjects.length > 0) {
        const deadlineStr = formatDate(targetDeadline);
        const dayName = getDayNameFromDate(targetDeadline);
        const freeSlot = findFreeSlotForDay(targetDeadline);

        if (freeSlot) {
          const startTime = freeSlot.time.split(' - ')[0];
          newTasks = [{
            id: crypto.randomUUID(),
            title: `${displayNames[0] || uniqueSubjects[0]} Work`,
            time: `${deadlineStr}, ${startTime}`,
            duration: "1h", type: "study", priority: "medium",
            description: `• Work for 60 minutes during your free slot.`,
            resources: [{ label: "Knowt", url: "https://knowt.com" }]
          }];
          return resolve({ newTasks, newClasses: [], newActivities: [], message: `I found a free slot in your routine! I've scheduled your **${displayNames[0] || uniqueSubjects[0]}** for **${startTime}** on **${deadlineStr}**.` });
        } else {
          // No free slot! Ask the user.
          const proposedTime = "5:00 PM";
          message = `I don't see any free slots in your routine for ${dayName}. I've proposed **${proposedTime}** for your ${displayNames[0] || uniqueSubjects[0]} work. **Is that fine?** If not, what time is best for you on these days?`;
          return resolve({ newTasks: [], newClasses: [], newActivities: [], message });
        }
      }

      resolve({ newTasks: [], newClasses: [], newActivities: [], message: "I'm here to help! Tell me about a test or assignment." });
    }, 800);
  });
};
