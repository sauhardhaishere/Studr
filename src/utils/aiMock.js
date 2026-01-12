// Mock AI logic to simulate parsing user input
// This file runs LOCALLY when the Cloud API is down or Key is invalid.

export const simulateAIAnalysis = async (conversationContext, currentTasks, activities, schedule, today = new Date()) => {
  return new Promise((resolve) => {
    setTimeout(async () => {
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
          // Sort by length descending to catch 'wednesday' before 'day' if 'day' was in the list
          const foundDay = daysOfWeek
            .slice()
            .sort((a, b) => b.length - a.length)
            .find(d => lastUserLower.includes(d));

          if (foundDay) {
            offset = getDayOffset(foundDay, lastUserLower.includes("next"));
          } else {
            // Default offset if no day found but user mentioned a task
            offset = 3;
          }
        }
        targetDeadline.setDate(today.getDate() + offset);
      }

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

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");
      const hasTaskMention = isTest || isAssignment || lastUserLower.includes("review") || lastUserLower.includes("study");

      if (hasTaskMention && uniqueSubjects.length === 0) {
        // Fallback for general task mentions like "homework is due tomorrow"
        uniqueSubjects.push("General");
        displayNames[0] = "General Homework/Study";
      }

      const missingSubjectIdx = displayNames.findIndex(name => name === null);

      // Check if user is PROVIDING a class name in response to a prompt
      const lastAILine = lines.filter(l => l.startsWith('Calendly:')).pop() || '';
      const isAnsweringClassQuestion = lastAILine.includes('full name of this class');

      let pendingSubject = null;
      if (isAnsweringClassQuestion) {
        // Find which subject we were waiting on
        const promptMatch = lastAILine.match(/have a (\w+) test/i);
        if (promptMatch) pendingSubject = promptMatch[1].toLowerCase();
      }

      if (isAnsweringClassQuestion && !hasTaskMention && lastUserMsg.length > 2) {
        // User provided the name! Let's inject a "phantom" class and look back for the task
        const newClassName = lastUserMsg;
        const newClassSubject = pendingSubject || "Other";
        const generatedClasses = [{ name: newClassName, subject: newClassSubject }];

        // Find the ORIGINAL request in the history
        const originalRequest = lines.slice().reverse().find(l =>
          l.startsWith('User:') && (l.toLowerCase().includes('test') || l.toLowerCase().includes('quiz') || l.toLowerCase().includes('homework'))
        )?.replace('User:', '').trim() || lastUserMsg;

        // Recursively or immediately simulate with the new context?
        // Let's just update the local variables and continue
        displayNames[0] = newClassName; // Assume it's for the first missing one
        const deadlineInfo = simulateAIAnalysis(`User: ${originalRequest}`, currentTasks, activities, [...(schedule || []), ...generatedClasses], today);

        return resolve({
          ...(await deadlineInfo),
          newClasses: generatedClasses,
          message: `Perfect! I've added **${newClassName}** to your schedule. Now, let's get that study plan ready for your ${newClassSubject} test!`
        });
      }

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
                description: `Dedicated slot to complete and review your ${displayNames[0]} assignment. Focus on active recall and comprehension.`,
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
          const routineBlocks = activities || [];
          const isRoutineSparse = routineBlocks.length < 5;
          let outOfRoutineSchedules = false;

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

                // Availability check for the session
                const hasFreeSlot = routineBlocks.some(b =>
                  b.isFreeSlot &&
                  (b.frequency === 'daily' || (b.appliedDays && b.appliedDays.includes(getDayNameFromDate(studyDate)))) &&
                  parseTimeToMinutes(b.time.split(' - ')[0]) <= totalMinutes &&
                  parseTimeToMinutes(b.time.split(' - ')[1]) >= totalMinutes + 45
                );

                if (!hasFreeSlot) outOfRoutineSchedules = true;

                newTasks.push({
                  id: crypto.randomUUID(),
                  title: `${name} - ${i === 1 ? 'Final Review' : 'Prep Session'}`,
                  time: `${studyDateStr}, ${timeStr}`,
                  duration: i === 1 ? "1h 30m" : "45m",
                  priority: i === 1 ? "high" : "medium",
                  type: "study",
                  description: i === 1
                    ? `Final high-intensity review for ${name}. Focus on practice exam and difficult concepts.`
                    : `Active recall session for ${name}. Reviewing core notes and identifying weak spots.`,
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

          if (isRoutineSparse) {
            message += " Since your routine isn't fully filled out yet, I've picked some standard times for you. Are you available during these times, or should we move them?";
          } else if (outOfRoutineSchedules) {
            message += " I noticed some of these sessions fall outside your typical free slots. Will you be available then, or would you like to adjust your routine?";
          }
        }
      } else {
        // --- MODIFICATION / RESCHEDULE LOGIC (Date & Time) ---
        const isMoveCommand = lastUserLower.includes("move") || lastUserLower.includes("reschedule") || lastUserLower.includes("change");
        const currentTks = currentTasks || [];

        if (isMoveCommand && currentTks.length > 0) {
          const targetSubject = (uniqueSubjects[0] || "").toLowerCase();
          // Find tasks related to this subject
          const subjectTasks = currentTks.filter(t => t.title.toLowerCase().includes(targetSubject));

          if (subjectTasks.length > 0) {
            let modifiedTasks = [];
            const timeMatch = lastUserLower.match(/(\d+)\s*(pm|am)/);

            if (dateParsed) {
              // Rescheduling a test date
              const newDeadlineStr = formatDate(targetDeadline);
              const newDeadlineDay = getDayNameFromDate(targetDeadline);

              subjectTasks.forEach((t) => {
                const isMainTest = t.type === 'task' && (t.title.toLowerCase().includes('test') || t.title.toLowerCase().includes('quiz') || t.title.toLowerCase().includes('due'));

                if (isMainTest) {
                  // Move main test to the new day
                  const oldTime = t.time.includes(',') ? t.time.split(',')[1].trim() : "8:00 AM";
                  modifiedTasks.push({ ...t, time: `${newDeadlineStr}, ${oldTime}` });
                } else if (t.type === 'study') {
                  // Shift study sessions relative to the new day
                  const isFinalReview = t.title.toLowerCase().includes('final');
                  const dayShift = isFinalReview ? 1 : 2;
                  const studyDate = new Date(targetDeadline);
                  studyDate.setDate(targetDeadline.getDate() - dayShift);

                  const oldTime = t.time.includes(',') ? t.time.split(',')[1].trim() : "4:00 PM";
                  modifiedTasks.push({ ...t, time: `${formatDate(studyDate)}, ${oldTime}` });
                }
              });

              resolve({
                newTasks: modifiedTasks,
                newClasses: [],
                newActivities: [],
                message: `I've rescheduled your **${uniqueSubjects[0] || targetSubject}** test and study plan to **${newDeadlineDay}, ${newDeadlineStr}**. All sessions have been shifted accordingly!`
              });
              return;
            } else if (timeMatch) {
              // Rescheduling just the time
              const newH = parseInt(timeMatch[1]);
              const ampm = timeMatch[2].toUpperCase();
              const isBulk = lastUserLower.includes("them") || lastUserLower.includes("all") || lastUserLower.includes("sessions");

              if (isBulk) {
                modifiedTasks = subjectTasks.map(t => {
                  const datePart = t.time.split(',')[0];
                  return { ...t, time: `${datePart}, ${newH}:00 ${ampm}` };
                });
                resolve({
                  newTasks: modifiedTasks,
                  newClasses: [],
                  newActivities: [],
                  message: `No problem! I've moved all your ${targetSubject} sessions to **${newH}:00 ${ampm}**.`
                });
              } else {
                const t = subjectTasks[0];
                const datePart = t.time.split(',')[0];
                modifiedTasks = [{ ...t, time: `${datePart}, ${newH}:00 ${ampm}` }];
                resolve({
                  newTasks: modifiedTasks,
                  newClasses: [],
                  newActivities: [],
                  message: `Sure thing! I've updated your **${t.title}** to **${newH}:00 ${ampm}**.`
                });
              }
              return;
            }
          }
        }

        // --- GREETING / CHAT LOGIC ---
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
