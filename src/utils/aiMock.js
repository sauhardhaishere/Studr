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

      // --- SMART TIME PARSER ---
      const parseUserTime = (text) => {
        // Look for ranges like "5-6" or "5 to 6" or single times like "5pm"
        const rangeMatch = text.match(/(\d+)\s*(-|to|until)\s*(\d+)\s*(am|pm)?/i);
        const singleMatch = text.match(/(\d+):?(\d+)?\s*(am|pm)/i) || text.match(/(\d+)\s*(pm|am)/i);

        if (rangeMatch) {
          const startH = parseInt(rangeMatch[1]);
          let ampm = (rangeMatch[4] || 'PM').toUpperCase();
          // If 5-6 pm, start is 5pm. If 11-12 am, start is 11am.
          return `${startH}:00 ${ampm}`;
        }
        if (singleMatch) {
          const h = parseInt(singleMatch[1]);
          const m = singleMatch[2] || "00";
          const ampm = (singleMatch[3] || 'PM').toUpperCase();
          return `${h}:${m} ${ampm}`;
        }
        return null;
      };

      const userTimePref = parseUserTime(lastUserLower);

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
          const foundDay = daysOfWeek.find(d => lastUserLower.includes(d));
          if (foundDay) offset = getDayOffset(foundDay, lastUserLower.includes("next"));
          else offset = 1;
        }
        targetDeadline.setDate(today.getDate() + offset);
      }

      const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
      const targetStart = new Date(targetDeadline); targetStart.setHours(0, 0, 0, 0);
      if (targetStart < todayStart) isPastDate = true;

      // --- SUBJECT DETECTION ---
      const subjectMap = [
        "math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "precalc", "algebra", "geometry", "stats", "science", "ap",
        "literature", "gov", "econ", "compsci", "coding", "art", "music", "pe", "health", "psych", "soc", "french", "latin", "german", "chinese", "phys"
      ];
      const foundSubjects = subjectMap.filter(s => lastUserLower.includes(s));
      const uniqueSubjects = [...new Set(foundSubjects)];
      const displayNames = uniqueSubjects.map(s => {
        const matchingClass = schedule && schedule.find(c => c.name.toLowerCase().includes(s) || (c.subject && c.subject.toLowerCase().includes(s)));
        return matchingClass ? matchingClass.name : null;
      });

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lastUserLower.includes("due");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");
      const hasTaskMention = isTest || isAssignment || lastUserLower.includes("review") || lastUserLower.includes("study");

      // Resources
      const getResourcesForSubject = (subject) => {
        const lower = subject.toLowerCase();
        if (lower.includes('math') || lower.includes('calc')) return [{ label: "Khan Academy Math", url: "https://www.khanacademy.org/math" }];
        return [{ label: "Quizlet", url: "https://quizlet.com" }];
      };

      // Handle Repeat Tests
      const existingTitles = (currentTasks || []).map(t => t.title.toLowerCase());
      const isRepeat = displayNames.some(name => name && existingTitles.some(et => et.includes(name.toLowerCase()) && (et.includes('test') || et.includes('exam'))));
      if (isRepeat && isTest && !lastUserLower.includes("move") && !lastUserLower.includes("change")) {
        return resolve({ newTasks: [], newClasses: [], newActivities: [], message: "You already have a test for this class. Want to reschedule it?" });
      }

      // Past check
      if (isPastDate && hasTaskMention) {
        return resolve({ newTasks: [], newClasses: [], newActivities: [], message: "I can't schedule things in the past. What's next on your agenda?" });
      }

      // Conversational State
      const isAnsweringClassQuestion = lastAILower.includes('full name of this class');
      const isAnsweringAvailability = lastAILower.includes('fill out your daily routine') || lastAILower.includes('best time') || lastAILower.includes('are you available');

      // Availability Follow-up
      if (isAnsweringAvailability && userTimePref) {
        const subject = uniqueSubjects[0] || "General";
        const subProper = subject.charAt(0).toUpperCase() + subject.slice(1);
        const dateStr = formatDate(targetDeadline);

        newTasks = [{
          id: crypto.randomUUID(),
          title: `${subProper} Session`,
          time: `${dateStr}, ${userTimePref}`,
          duration: "1h", priority: "medium", type: "study",
          description: `• Work specifically on ${subProper} for 60 minutes. Use the resources below to practice problem sets and active recall.`,
          resources: getResourcesForSubject(subProper)
        }];
        return resolve({ newTasks, newClasses: [], newActivities: [], message: `Perfect! I've pinned your **${subProper}** session for **${userTimePref}** on **${dateStr}**. Study hard!` });
      }

      if (hasTaskMention && uniqueSubjects.length === 0) { uniqueSubjects.push("General"); displayNames[0] = "General Homework/Study"; }
      const missingSubjectIdx = displayNames.findIndex(name => name === null);
      if (hasTaskMention && missingSubjectIdx !== -1) {
        return resolve({ newTasks: [], newClasses: [], newActivities: [], message: `I see you have a ${uniqueSubjects[missingSubjectIdx]} test. What's the full name of the class?` });
      }

      if (hasTaskMention && uniqueSubjects.length > 0) {
        const deadlineStr = formatDate(targetDeadline);
        const deadlineDay = getDayNameFromDate(targetDeadline);
        const taskTime = userTimePref || "4:00 PM";

        if (isAssignment) {
          newTasks = [{
            id: crypto.randomUUID(),
            title: `${displayNames[0] || uniqueSubjects[0]} Work`,
            time: `${deadlineStr}, ${taskTime}`,
            duration: "45m", type: "study", priority: "medium",
            description: `• Work on ${displayNames[0] || uniqueSubjects[0]} for 45 minutes to ensure completion before the deadline.`,
            resources: getResourcesForSubject(displayNames[0] || uniqueSubjects[0])
          }];
          message = `Done! I've added your **${displayNames[0] || uniqueSubjects[0]}** task for **${taskTime}** on **${deadlineStr}**.`;
        } else {
          message = `Got it! I've built a specific study plan for your **${displayNames[0] || uniqueSubjects[0]}** test on ${deadlineDay}.`;
          displayNames.forEach((name, idx) => {
            const sub = name || uniqueSubjects[idx];
            newTasks.push({
              id: crypto.randomUUID(),
              title: `${sub} Test`,
              time: `${deadlineStr}, 8:15 AM`,
              type: "task", priority: "high",
              description: `• Official assessment for ${sub}. Ensure you have all materials ready.`,
              resources: getResourcesForSubject(sub)
            });
            for (let i = 1; i <= 2; i++) {
              const d = new Date(targetDeadline); d.setDate(d.getDate() - i);
              if (d >= todayStart) {
                newTasks.push({
                  id: crypto.randomUUID(),
                  title: `${sub} ${i === 1 ? 'Final Review' : 'Prep Session'}`,
                  time: `${formatDate(d)}, ${taskTime}`,
                  duration: i === 1 ? "1h 30m" : "45m", type: "study", priority: "medium",
                  description: i === 1 ? `• Detailed study for 90 minutes. Take a practice test and review and weak spots.` : `• Topic review for 45 minutes. Focus on core concepts and vocabulary.`,
                  resources: getResourcesForSubject(sub)
                });
              }
            }
          });
        }
      } else {
        message = "I'm ready to help! You can tell me about an upcoming test or homework, or ask me to move your sessions.";
      }
      resolve({ newTasks, newClasses: [], newActivities: [], message });
    }, 800);
  });
};
