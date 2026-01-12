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
      const dayTypos = {
        "thurs": "thursday", "thur": "thursday", "thrudsay": "thursday", "thrusday": "thursday",
        "tues": "tuesday", "tuseday": "tuesday", "wednes": "wednesday", "weds": "wednesday",
        "mon": "monday", "fri": "friday", "sat": "saturday", "sun": "sunday"
      };
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
          let foundDay = daysOfWeek.find(d => lastUserLower.includes(d));
          if (!foundDay) {
            const typo = Object.keys(dayTypos).find(t => lastUserLower.includes(t));
            if (typo) foundDay = dayTypos[typo];
          }

          if (foundDay) offset = getDayOffset(foundDay, lastUserLower.includes("next"));
          else offset = 3;
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

      // --- RESOURCES ---
      const getResources = (sub) => {
        const s = sub.toLowerCase();
        if (s.includes('math') || s.includes('calc')) return [{ label: "Khan Academy Math", url: "https://www.khanacademy.org/math" }];
        if (s.includes('bio') || s.includes('science')) return [{ label: "BioDigital", url: "https://www.biodigital.com" }];
        return [{ label: "Quizlet", url: "https://quizlet.com" }];
      };

      // --- AVAILABILITY LOOKUP ---
      const routineBlocks = activities || [];
      const freeSlots = routineBlocks.filter(b => b.isFreeSlot);
      const findFreeSlot = (date) => {
        const dName = getDayNameFromDate(date);
        return freeSlots.find(s => s.appliedDays && s.appliedDays.includes(dName)) || freeSlots.find(s => s.frequency === 'daily');
      };

      // --- CONVERSATIONAL STATES ---
      const isAnsweringAvailability = lastAILower.includes('is that fine') || lastAILower.includes('what time is best') || lastAILower.includes('fill out your daily routine');

      // 1. Availability Handle (Yes/No with Time)
      if (isAnsweringAvailability && (lastUserLower === 'yes' || lastUserLower.includes('yes that') || userTimePref)) {
        const propTime = (lastAILine.match(/(\d+):?(\d+)?\s*(AM|PM)/i) || ["5:00 PM"])[0];
        const finalTime = userTimePref ? userTimePref.start : propTime;
        const subject = uniqueSubjects[0] || "General";
        const subProper = subject.charAt(0).toUpperCase() + subject.slice(1);

        newTasks = [{
          id: crypto.randomUUID(),
          title: `${subProper} Session`,
          time: `${formatDate(targetDeadline)}, ${finalTime}`,
          duration: "1h", type: "study", priority: "medium",
          description: `• Work for 60 minutes. Focus on key terms and practice problems.`,
          resources: getResources(subject)
        }];

        if (userTimePref) {
          newActivities = [{
            id: crypto.randomUUID(),
            title: "Free Slot",
            time: userTimePref.full || `${userTimePref.start} - ${userTimePref.end}`,
            frequency: "weekly",
            appliedDays: [getDayNameFromDate(targetDeadline)],
            isFreeSlot: true
          }];
        }

        return resolve({ newTasks, newActivities, message: `Perfect! Scheduled for **${finalTime}**. ${userTimePref ? "I've also saved this to your routine!" : ""}` });
      }

      // --- MAIN SCHEDULING ---
      if (hasTaskMention && uniqueSubjects.length > 0) {
        const deadlineStr = formatDate(targetDeadline);
        const dayName = getDayNameFromDate(targetDeadline);
        const sub = displayNames[0] || uniqueSubjects[0];

        // NO REPEATS CHECK
        const isRepeat = (currentTasks || []).some(t => t.title.toLowerCase().includes(sub.toLowerCase()) && (t.title.toLowerCase().includes('test') || t.title.toLowerCase().includes('exam')));
        if (isRepeat && isTest && !lastUserLower.includes("move")) {
          return resolve({ newTasks: [], message: `You already have a **${sub}** test scheduled. Want to move it?` });
        }

        if (isAssignment) {
          const slot = findFreeSlot(targetDeadline);
          const finalTime = userTimePref ? userTimePref.start : (slot ? slot.time.split(' - ')[0] : null);

          if (!finalTime) {
            return resolve({ newTasks: [], message: `I don't see any free slots for ${dayName}. Is **5:00 PM** fine for your **${sub}** work?` });
          }

          newTasks = [{
            id: crypto.randomUUID(), title: `${sub} Work`, time: `${deadlineStr}, ${finalTime}`,
            duration: "45m", type: "study", priority: "medium",
            description: `• Work for 45 minutes to finish your ${sub} homework.`, resources: getResources(sub)
          }];
          return resolve({ newTasks, message: `Scheduled your **${sub}** homework for **${finalTime}** on **${deadlineStr}**.` });

        } else if (isTest) {
          // TEST PLAN (WITH REVIEWS)
          newTasks.push({
            id: crypto.randomUUID(), title: `${sub} Test`, time: `${deadlineStr}, 8:00 AM`,
            type: "task", priority: "high", description: `• Main assessment for ${sub}.`, resources: getResources(sub)
          });

          // Reviews
          for (let i = 1; i <= 2; i++) {
            const d = new Date(targetDeadline); d.setDate(d.getDate() - i);
            if (d >= today) {
              const slot = findFreeSlot(d);
              const rTime = slot ? slot.time.split(' - ')[0] : "4:00 PM";
              newTasks.push({
                id: crypto.randomUUID(),
                title: `${sub} ${i === 1 ? 'Review' : 'Prep'}`,
                time: `${formatDate(d)}, ${rTime}`,
                duration: i === 1 ? "1h" : "45m", type: "study", priority: "medium",
                description: `• ${i === 1 ? 'Final brush up' : 'Study'} for ${sub} for ${i === 1 ? '60' : '45'} minutes.`,
                resources: getResources(sub)
              });
            }
          }
          return resolve({ newTasks, message: `Got it! Created a study plan for your **${sub}** test. I've scheduled reviews leading up to ${deadlineStr}.` });
        }
      }

      resolve({ newTasks: [], message: "I'm ready! Tell me about a test or homework." });
    }, 800);
  });
};
