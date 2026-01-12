// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date()) => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      const lower = conversationContext.toLowerCase();
      let message = "";
      let newTasks = [];

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
        if (diff < 0) diff += 7; // It's coming up this week
        if (isNext) diff += 7; // Force it to next week

        return diff;
      };

      const formatDate = (dateObj) => {
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };

      const getDayNameFromDate = (dateObj) => {
        return dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      };

      const parseTimeToMinutes = (timeStr) => {
        const match = timeStr.match(/(\d+):?(\d+)?\s*(AM|PM)/i);
        if (!match) return 1020; // Default 5:00 PM
        let h = parseInt(match[1]);
        const m = match[2] ? parseInt(match[2]) : 0;
        const isPm = match[3] ? match[3].toUpperCase() === 'PM' : h >= 1 && h <= 11; // Guess PM if 1-11
        if (isPm && h < 12) h += 12;
        if (!isPm && h === 12) h = 0;
        return h * 60 + m;
      };

      // --- DATE PARSING ---
      let targetDeadline = new Date(today);
      let offset = 3;
      let dateParsed = false;
      let isPastDate = false;

      const monthMatch = months.find(m => lastUserLower.includes(m));
      if (monthMatch) {
        const monthIdx = months.indexOf(monthMatch);
        const dateMatch = lastUserLower.match(new RegExp(`${monthMatch}\\s*(\\d+)`));
        if (dateMatch) {
          const dayNum = parseInt(dateMatch[1]);
          targetDeadline = new Date(today.getFullYear(), monthIdx, dayNum);

          if (targetDeadline < today && !lastUserLower.includes("last") && !lastUserLower.includes("yesterday")) {
            if (today.getMonth() !== monthIdx || today.getDate() !== dayNum) {
              targetDeadline.setFullYear(today.getFullYear() + 1);
            }
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
          const foundDay = daysOfWeek
            .slice()
            .sort((a, b) => b.length - a.length)
            .find(d => lastUserLower.includes(d));

          if (foundDay) {
            offset = getDayOffset(foundDay, lastUserLower.includes("next"));
          } else {
            offset = 1; // Default to tomorrow if not specified
          }
        }
        targetDeadline.setDate(today.getDate() + offset);
      }

      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const targetStart = new Date(targetDeadline);
      targetStart.setHours(0, 0, 0, 0);
      if (targetStart < todayStart) isPastDate = true;

      // --- SUBJECT DETECTION ---
      const subjectMap = [
        "math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "precalc", "algebra", "geometry", "stats", "science", "ap",
        "literature", "gov", "econ", "compsci", "coding", "art", "music", "pe", "health", "psych", "soc", "french", "latin", "german", "chinese", "phys"
      ];
      const foundSubjects = subjectMap.filter(s => lastUserLower.includes(s));
      const uniqueSubjects = [...new Set(foundSubjects)];

      const displayNames = uniqueSubjects.map(s => {
        const matchingClass = schedule && schedule.find(c =>
          c.name.toLowerCase().includes(s) || (c.subject && c.subject.toLowerCase().includes(s))
        );
        return matchingClass ? matchingClass.name : null;
      });

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lastUserLower.includes("due");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");
      const hasTaskMention = isTest || isAssignment || lastUserLower.includes("review") || lastUserLower.includes("study");

      // --- RESOURCE GENERATOR ---
      const getResourcesForSubject = (subject) => {
        const lower = subject.toLowerCase();
        if (lower.includes('math') || lower.includes('calc') || lower.includes('algebra')) {
          return [{ label: "Khan Academy Math", url: "https://www.khanacademy.org/math" }, { label: "WolframAlpha", url: "https://www.wolframalpha.com" }];
        }
        if (lower.includes('bio') || lower.includes('chem') || lower.includes('science') || lower.includes('phys')) {
          return [{ label: "Khan Academy Science", url: "https://www.khanacademy.org/science" }, { label: "BioDigital", url: "https://www.biodigital.com" }];
        }
        if (lower.includes('history') || lower.includes('gov')) {
          return [{ label: "Heimler's History", url: "https://www.youtube.com/@HeimlersHistory" }, { label: "C-SPAN", url: "https://www.c-span.org" }];
        }
        return [{ label: "Quizlet", url: "https://quizlet.com" }, { label: "Knowt", url: "https://knowt.com" }];
      };

      // --- PREVENT REPEATS ---
      const existingTitles = (currentTasks || []).map(t => t.title.toLowerCase());
      const isRepeat = displayNames.some(name => name && existingTitles.some(et => et.includes(name.toLowerCase()) && (et.includes('test') || et.includes('exam'))));

      if (isRepeat && isTest && !lastUserLower.includes("move") && !lastUserLower.includes("change")) {
        return resolve({
          newTasks: [], newClasses: [], newActivities: [],
          message: "I notice you already have a test scheduled for that class. Would you like to reschedule the existing one instead?"
        });
      }

      // Past date check
      if (isPastDate && hasTaskMention) {
        return resolve({
          newTasks: [], newClasses: [], newActivities: [],
          message: `I can't schedule tasks in the past (${formatDate(targetDeadline)}). Let's look forward—any upcoming work I can help with?`
        });
      }

      const isAnsweringClassQuestion = lastAILower.includes('full name of this class');
      const isAnsweringAvailability = lastAILower.includes('fill out your daily routine') || lastAILower.includes('are you available at this time');

      if (isAnsweringClassQuestion && !hasTaskMention && lastUserMsg.length > 2) {
        let pendingSubject = "Other";
        const promptMatch = lastAILine.match(/have a (\w+) test/i);
        if (promptMatch) pendingSubject = promptMatch[1].toLowerCase();
        const newClassName = lastUserMsg;
        const generatedClasses = [{ name: newClassName, subject: pendingSubject }];
        const originalRequest = lines.slice().reverse().find(l => l.startsWith('User:') && (l.toLowerCase().includes('test') || l.toLowerCase().includes('quiz') || l.toLowerCase().includes('homework')))?.replace('User:', '').trim() || lastUserMsg;
        const deadlineInfo = await simulateAIAnalysis(`User: ${originalRequest}`, currentTasks, activities, [...(schedule || []), ...generatedClasses], today);
        return resolve({ ...deadlineInfo, newClasses: generatedClasses, message: `Added **${newClassName}**. Planning your sessions now!` });
      }

      if (isAnsweringAvailability && lastUserLower.match(/(\d+)\s*(am|pm)/i)) {
        const timeMatch = lastUserLower.match(/(\d+):?(\d+)?\s*(AM|PM)/i) || lastUserLower.match(/(\d+)\s*(pm|am)/i);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const ampm = (timeMatch[timeMatch.length - 1] || 'PM').toUpperCase();
          const timeStr = `${hour}:00 ${ampm}`;
          const subject = uniqueSubjects[0] || "General";
          const subProper = subject.charAt(0).toUpperCase() + subject.slice(1);
          const dateStr = formatDate(targetDeadline);

          newTasks = [{
            id: crypto.randomUUID(),
            title: `${subProper} Work Session`,
            time: `${dateStr}, ${timeStr}`,
            duration: "1h",
            priority: "medium",
            type: "study",
            description: `Focus session for ${subProper}.`,
            resources: getResourcesForSubject(subProper)
          }];
          return resolve({ newTasks, newClasses: [], newActivities: [], message: `Pinned your session for **${timeStr}** on **${dateStr}**!` });
        }
      }

      if (hasTaskMention && uniqueSubjects.length === 0) {
        uniqueSubjects.push("General");
        displayNames[0] = "General Homework/Study";
      }

      const missingSubjectIdx = displayNames.findIndex(name => name === null);
      if (hasTaskMention && missingSubjectIdx !== -1) {
        const sub = uniqueSubjects[missingSubjectIdx];
        return resolve({ newTasks: [], newClasses: [], newActivities: [], message: `I see you have a ${sub} test, but I don't have that class. What's its full name?` });
      }

      if (hasTaskMention && uniqueSubjects.length > 0) {
        const deadlineStr = formatDate(targetDeadline);
        const deadlineDay = getDayNameFromDate(targetDeadline);

        if (isAssignment) {
          const routineBlocks = activities || [];
          const timeInUserMsg = lastUserLower.match(/(\d+)\s*(pm|am)/i);

          if (routineBlocks.length < 1 && !timeInUserMsg) {
            message = `To schedule your ${uniqueSubjects[0]} perfectly, could you fill out your daily routine in 'My Schedule'? Or just give me a time like "5pm"!`;
            return resolve({ newTasks: [], message });
          }

          let chosenSlot = null;
          if (timeInUserMsg) {
            const h = parseInt(timeInUserMsg[1]);
            const ampm = (timeInUserMsg[2] || 'PM').toUpperCase();
            chosenSlot = { dateStr: deadlineStr, dayName: deadlineDay, time: `${h}:00 ${ampm}` };
          } else {
            const freeSlots = routineBlocks.filter(b => b.isFreeSlot);
            if (freeSlots.length > 0) {
              const slot = freeSlots[0];
              chosenSlot = { dateStr: deadlineStr, dayName: deadlineDay, time: slot.time.split(' - ')[0] };
            }
          }

          if (chosenSlot) {
            newTasks = [{
              id: crypto.randomUUID(),
              title: `${displayNames[0] || uniqueSubjects[0]} Task`,
              time: `${chosenSlot.dateStr}, ${chosenSlot.time}`,
              duration: "1h",
              type: "study",
              priority: "medium",
              description: `Dedicated time to complete your ${displayNames[0] || uniqueSubjects[0]} work.`,
              resources: getResourcesForSubject(displayNames[0] || uniqueSubjects[0])
            }];
            message = `Done! Scheduled for **${chosenSlot.time}** on **${chosenSlot.dateStr}**.`;
          } else {
            message = `I couldn't find a free slot. What time works for you?`;
          }
        } else {
          message = `Got it! You have a ${displayNames[0] || uniqueSubjects[0]} test on ${deadlineDay} (${deadlineStr}). I've built a study plan!`;
          displayNames.forEach((name, idx) => {
            const sub = name || uniqueSubjects[idx];
            newTasks.push({
              id: crypto.randomUUID(),
              title: `${sub} Test`,
              time: `${deadlineStr}, 8:00 AM`,
              type: "task",
              priority: "high",
              description: `Assessment for ${sub}.`,
              resources: getResourcesForSubject(sub)
            });
            for (let i = 1; i <= 2; i++) {
              const d = new Date(targetDeadline);
              d.setDate(d.getDate() - i);
              const dStart = new Date(d); dStart.setHours(0, 0, 0, 0);
              const nowStart = new Date(today); nowStart.setHours(0, 0, 0, 0);
              if (dStart >= nowStart) {
                newTasks.push({
                  id: crypto.randomUUID(),
                  title: `${sub} ${i === 1 ? 'Final Review' : 'Prep Session'}`,
                  time: `${formatDate(d)}, 4:00 PM`,
                  type: "study",
                  priority: "medium",
                  description: i === 1 ? `Final brush up for ${sub}.` : `Reviewing core concepts for ${sub}.`,
                  resources: getResourcesForSubject(sub)
                });
              }
            }
          });
        }
      } else {
        const isMove = lastUserLower.includes("move") || lastUserLower.includes("reschedule") || lastUserLower.includes("change");
        if (isMove && currentTasks && currentTasks.length > 0) {
          const timeMatch = lastUserLower.match(/(\d+)\s*(pm|am)/i);
          const targetSubject = (uniqueSubjects[0] || "").toLowerCase();
          if (timeMatch) {
            const newH = timeMatch[1];
            const ampm = (timeMatch[2] || "PM").toUpperCase();
            const updated = currentTasks.map(t => {
              if (t.type === 'study' && (targetSubject === "" || t.title.toLowerCase().includes(targetSubject))) {
                const dateStr = t.time.includes(',') ? t.time.split(',')[0] : formatDate(today);
                return { ...t, time: `${dateStr}, ${newH}:00 ${ampm}` };
              }
              return t;
            });
            return resolve({ newTasks: updated, message: `Moved your sessions to ${newH}:00 ${ampm}!` });
          }
        }

        const greetings = ["hi", "hello", "hey", "sup", "yo"];
        if (greetings.some(g => lastUserLower.startsWith(g))) {
          message = "Hey! Ready to organize? Tell me about a test or homework.";
        } else {
          message = "I'm listening! You can schedule tests, homework, or reschedule existing plans.";
        }
      }
      resolve({ newTasks, newClasses: [], newActivities: [], message });
    }, 800);
  });
};
