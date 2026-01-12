// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date()) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const lower = conversationContext.toLowerCase();
      let message = "";
      let newTasks = [];

      // Extract just the last user message
      const lines = conversationContext.split('\n');
      const lastUserMsg = lines.filter(l => l.startsWith('User:')).pop()?.replace('User:', '').trim() || '';
      const lastUserLower = lastUserMsg.toLowerCase();

      // --- DYNAMIC DATE CALCULATOR ---
      const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

      const getDayOffset = (targetDayName, isNext) => {
        const todayIdx = today.getDay();
        const targetIdx = daysOfWeek.indexOf(targetDayName.toLowerCase());
        if (targetIdx === -1) return 3;

        let diff = targetIdx - todayIdx;
        if (diff <= 0) diff += 7;
        if (isNext && lastUserLower.includes("next " + targetDayName)) diff += 7;

        return diff;
      };

      const formatDate = (dateObj) => {
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };

      const getDayNameFromDate = (dateObj) => {
        return dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      };

      const parseTimeToMinutes = (timeStr) => {
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return 0;
        let h = parseInt(match[1]);
        const m = parseInt(match[2]);
        const isPm = match[3].toUpperCase() === 'PM';
        if (isPm && h < 12) h += 12;
        if (!isPm && h === 12) h = 0;
        return h * 60 + m;
      };

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
          if (targetDeadline < today && (today.getMonth() !== monthIdx || today.getDate() !== dayNum)) {
            targetDeadline.setFullYear(today.getFullYear() + 1);
          }
          dateParsed = true;
          offset = Math.round((targetDeadline - today) / (1000 * 60 * 60 * 24));
        }
      }

      if (!dateParsed) {
        if (lastUserLower.includes("tomorrow")) offset = 1;
        else if (lastUserLower.includes("today")) offset = 0;
        else {
          const foundDay = daysOfWeek.find(d => lastUserLower.includes(d));
          if (foundDay) {
            offset = getDayOffset(foundDay, lastUserLower.includes("next"));
          }
        }
        targetDeadline.setDate(today.getDate() + offset);
      }

      // --- SUBJECT DETECTION ---
      const subjectMap = ["math", "bio", "chem", "english", "history", "physics", "spanish", "calc", "science", "ap"];
      const foundSubjects = subjectMap.filter(s => lastUserLower.includes(s));
      const uniqueSubjects = [...new Set(foundSubjects)];

      const displayNames = uniqueSubjects.map(s => {
        const matchingClass = schedule && schedule.find(c =>
          c.name.toLowerCase().includes(s) || (c.subject && c.subject.toLowerCase().includes(s))
        );
        return matchingClass ? matchingClass.name : null;
      });

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");
      const hasTaskMention = isTest || isAssignment || lastUserLower.includes("review") || lastUserLower.includes("study");

      // --- CLASS VERIFICATION (STOP CONDITION) ---
      const missingSubjectIdx = displayNames.findIndex(name => name === null);
      if (hasTaskMention && missingSubjectIdx !== -1) {
        const sub = uniqueSubjects[missingSubjectIdx];
        const subDisplay = sub.charAt(0).toUpperCase() + sub.slice(1);
        resolve({
          newTasks: [],
          newClasses: [],
          newActivities: [],
          message: `I see you have a ${subDisplay} test, but I don't have a ${subDisplay} class in your schedule yet. What's the full name of this class? (e.g., AP Calculus, Algebra 2)`
        });
        return;
      }

      if (hasTaskMention && uniqueSubjects.length > 0) {
        const subjectListStr = displayNames.length > 1
          ? displayNames.slice(0, -1).join(", ") + " and " + displayNames.slice(-1)
          : displayNames[0];

        const deadlineStr = formatDate(targetDeadline);
        const deadlineDay = getDayNameFromDate(targetDeadline);

        if (isAssignment) {
          const routineBlocks = activities || [];
          const currentTks = currentTasks || [];

          if (routineBlocks.length < 3) {
            message = `To help you schedule your ${subjectListStr} assignment perfectly, could you fill out your daily routine in 'My Schedule'? Once I see your free slots, I can pick the best time for you!`;
            resolve({ generatedSchedule: [], newTasks: [], message: message });
            return;
          }

          let chosenSlot = null;
          const currentMinutes = today.getHours() * 60 + today.getMinutes();

          for (let dOff = 0; dOff <= offset; dOff++) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() + dOff);
            const checkDateStr = formatDate(checkDate);

            if (dOff === offset && dOff > 0) continue;

            const freeSlotsThisDay = routineBlocks.filter(b =>
              b.isFreeSlot &&
              (b.frequency === 'daily' || (b.appliedDays && b.appliedDays.includes(getDayNameFromDate(checkDate))))
            );

            for (const slot of freeSlotsThisDay) {
              const startTimeStr = slot.time.split(' - ')[0];
              const slotMinutes = parseTimeToMinutes(startTimeStr);

              if (dOff === 0 && slotMinutes <= currentMinutes) continue;

              const hasConflict = currentTks.some(t =>
                t.time.includes(checkDateStr) && t.time.includes(startTimeStr)
              );

              if (!hasConflict) {
                chosenSlot = { dateStr: checkDateStr, dayName: getDayNameFromDate(checkDate), time: startTimeStr };
                break;
              }
            }
            if (chosenSlot) break;
          }

          if (chosenSlot) {
            newTasks = [
              {
                id: crypto.randomUUID(),
                title: `${displayNames[0]} Homework`,
                time: `${chosenSlot.dateStr}, ${chosenSlot.time}`,
                duration: "45m",
                priority: "medium",
                type: "study",
                description: `Work session for your assignment.`,
                resources: [{ label: "Study Guide", url: "https://quizlet.com" }]
              },
              {
                id: crypto.randomUUID(),
                title: `${displayNames[0]} DUE`,
                time: `${deadlineStr}, 11:59 PM`,
                duration: "---",
                priority: "high",
                type: "task",
                description: `Official deadline for ${displayNames[0]}.`,
                resources: [{ label: "Submission Portal", url: "https://canvas.instructure.com" }]
              }
            ];
            message = `I've set up two markers for your ${subjectListStr} assignment: a work session for ${chosenSlot.dayName} (${chosenSlot.dateStr}) and the final deadline on ${deadlineDay} (${deadlineStr})!`;
          } else {
            message = `I checked your schedule and you don't have any open free slots in the future before the ${subjectListStr} assignment is due on ${deadlineStr}. Would you like me to squeeze it in anyway?`;
          }

        } else {
          // --- TEST LOGIC (IMPROVED INTERLEAVING) ---
          message = `Got it! You have ${displayNames.length > 1 ? "multiple tests" : "a " + displayNames[0] + " test"} coming up on ${deadlineDay} (${deadlineStr}). I've perfectly interleaved your study sessions to ensure you have a dedicated day for each subject!`;

          displayNames.forEach((name, subjectIdx) => {
            // The Test Task (Morning of Test Day)
            newTasks.push({
              id: crypto.randomUUID(),
              title: `${name} Test`,
              time: `${deadlineStr}, ${8 + subjectIdx}:15 AM`,
              duration: "1h",
              priority: "high",
              type: "task",
              description: "Official assessment date.",
              resources: [{ label: "Final Exam Prep", url: "https://www.khanacademy.org" }]
            });

            // The Prep Sessions (Before Test Day)
            // Goal: Interleave subjects. Sub0=T-1, Sub1=T-2, Sub0=T-3, etc.
            for (let i = 1; i <= Math.min(offset, 2); i++) {
              // Interleave formula: dayShift = (session_index * num_subjects) + subject_index
              // But session_index starts at 1, so offset by 1.
              let slotIndex = (i - 1) * displayNames.length + subjectIdx;
              let dayShift = slotIndex + 1; // At least 1 day before deadline

              const studyDate = new Date(targetDeadline);
              studyDate.setDate(targetDeadline.getDate() - dayShift);

              const studyDateStr = formatDate(studyDate);
              const nowMinutes = today.getHours() * 60 + today.getMinutes();

              // Only schedule in the future
              if (studyDate > today || (studyDate.toDateString() === today.toDateString())) {
                const baseHour = 4 + subjectIdx; // Offset by 1 hour per subject
                const totalMinutes = baseHour * 60;

                // If it's today, check if 4:00 PM has passed
                if (studyDate.toDateString() === today.toDateString() && totalMinutes <= nowMinutes) {
                  continue;
                }

                const h = Math.floor(totalMinutes / 60);
                const m = totalMinutes % 60;
                const timeStr = `${h}:${m === 0 ? "00" : m} PM`;

                newTasks.push({
                  id: crypto.randomUUID(),
                  title: `${name} - ${i === 1 ? 'Final Review' : 'Prep Session'}`,
                  time: `${studyDateStr}, ${timeStr}`,
                  duration: "1h",
                  priority: i === 1 ? "high" : "medium",
                  type: "study",
                  description: `Dedicated review for ${name}. I've given this its own day at ${timeStr} to avoid overlap!`,
                  resources: [
                    { label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" },
                    ...(name.toLowerCase().includes('math') || name.toLowerCase().includes('calc')
                      ? [{ label: "Khan Academy Math", url: "https://www.khanacademy.org/math" }]
                      : name.toLowerCase().includes('bio') || name.toLowerCase().includes('chem') || name.toLowerCase().includes('science')
                        ? [{ label: "Khan Academy Science", url: "https://www.khanacademy.org/science" }]
                        : name.toLowerCase().includes('history')
                          ? [{ label: "Heimler's History", url: "https://www.youtube.com/@HeimlersHistory" }]
                          : [{ label: "Knowt", url: "https://knowt.com" }])
                  ]
                });
              }
            }
          });
        }
      } else {
        // --- CHAT / GREETING LOGIC ---
        const greetings = ["hi", "hello", "hey", "sup", "yo", "good morning", "good afternoon", "good evening"];
        const feelings = ["how are you", "how's it going", "how are things", "what's up"];

        if (greetings.some(g => lastUserLower.startsWith(g)) || feelings.some(f => lastUserLower.includes(f))) {
          const hours = today.getHours();
          let timeGreeting = "Hello";
          if (hours < 12) timeGreeting = "Good morning";
          else if (hours < 17) timeGreeting = "Good afternoon";
          else timeGreeting = "Good evening";

          if (feelings.some(f => lastUserLower.includes(f))) {
            message = `${timeGreeting}! I'm doing great, thanks for asking. I'm ready to help you organize your classes and study sessions. Do you have any tests or assignments coming up?`;
          } else {
            message = `${timeGreeting}! I'm Calendly, your AI study assistant. How can I help you with your schedule today? You can tell me about upcoming tests or assignments!`;
          }
        } else if (lastUserLower.includes("thank") || lastUserLower.includes("thanks")) {
          message = "You're very welcome! I'm here to help you stay on top of your studies. Let me know if you need anything else!";
        } else if (lastUserLower.includes("who are you") || lastUserLower.includes("what are you")) {
          message = "I'm Calendly, your personal AI student assistant. I help you track your classes, manage your assignments, and create perfect study schedules for your exams. Want to try scheduling something?";
        } else {
          message = "I'm here to help! If you have a specific test or assignment, tell me the subject and date (e.g., 'Math test next Tuesday') and I'll build a study plan for you. Otherwise, feel free to ask me anything!";
        }
      }

      resolve({
        generatedSchedule: newTasks,
        newTasks: newTasks,
        newClasses: [],
        newActivities: [],
        message: message
      });
    }, 800);
  });
};
