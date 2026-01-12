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
      const foundSubjects = subjectMap.filter(s => lower.includes(s)); // Search entire history
      const uniqueSubjects = [...new Set(foundSubjects)];

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz") || lower.includes("test");
      const hasTaskMention = isTest || isAssignment;

      // --- AGENTIC MEMORY: Handling class creation replies ---
      const isAnsweringClassName = lastAILower.includes('full name of that class') || lastAILower.includes("full name of your");
      const isAnsweringConfirmDate = lastAILower.includes('schedule that') && lastAILower.includes('different day');

      // 1. If user confirms date after class creation
      if (isAnsweringConfirmDate && (lastUserLower.includes("yes") || parseDateFromText(lastUserLower))) {
        // Carry on to main scheduling logic below...
      } else if (isAnsweringClassName && lastUserMsg.length > 1 && !hasTaskMention) {
        const subjectFound = subjectMap.find(s => lower.includes(s)) || "General";
        const subCategory = subjectFound.charAt(0).toUpperCase() + subjectFound.slice(1);
        const newClass = { id: crypto.randomUUID(), name: lastUserMsg, subject: subCategory };
        newClasses = [newClass];
        // We return here to update the state with the NEW class first
        return resolve({
          newTasks: [],
          newClasses,
          message: `Awesome! I've added **${lastUserMsg}** to your schedule. Should I go ahead and schedule that ${subjectFound} test for this Wednesday?`
        });
      }

      // --- MAIN SCHEDULING LOGIC ---
      const findClassForSubject = (sub) => schedule && schedule.find(c => c.name.toLowerCase().includes(sub) || (c.subject && c.subject.toLowerCase().includes(sub)));

      if (hasTaskMention && uniqueSubjects.length > 0) {
        const primarySubject = uniqueSubjects[0];
        let classRes = findClassForSubject(primarySubject);

        // If we just created the class in the context of this transaction, we might not have it in 'schedule' yet
        // However, the above 'isAnsweringClassName' block handles the creation turn.
        // This block handles the FOLLOW-UP turn where the class is now in the schedule.

        if (!classRes) {
          return resolve({ newTasks: [], message: `I see you have a ${primarySubject} test! What's the full name of that class in your schedule?` });
        }

        const subName = classRes.name;
        const deadlineStr = formatDate(targetDeadline);

        // --- STUDY HELPER COACHING ---
        const getStudyAdvice = (sub, stage) => {
          const s = sub.toLowerCase();
          if (stage === 'final') {
            if (s.includes('math') || s.includes('calc')) return "• Work for 60 minutes. Complete a full practice test under timed conditions. Review your 'error log'.";
            if (s.includes('latin') || s.includes('spanish') || s.includes('english')) return "• Work for 60 minutes. Conduct a mock conversation or vocabulary blitz. Use active recall on every key term.";
            return "• Work for 60 minutes. Conduct a mock exam. Use active recall on every key concept.";
          }
          return "• Work for 45 minutes. Re-organize your notes and identify the 5 most likely exam topics.";
        };

        const getResources = (isReview = false) => {
          const res = [{ label: "Quizlet", url: "https://quizlet.com" }];
          if (isReview) res.push({ label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" });
          return res;
        };

        // --- TIME SLOTTING ---
        const routineBlocks = activities || [];
        const freeSlots = routineBlocks.filter(b => b.isFreeSlot);
        const getSlot = (date, idx) => {
          const dName = getDayNameFromDate(date);
          const slot = freeSlots.find(s => s.appliedDays?.includes(dName)) || freeSlots.find(s => s.frequency === 'daily');
          let h = 16; // 4 PM
          if (slot) {
            const m = slot.time.match(/(\d+)/);
            if (m) h = parseInt(m[1]) + (slot.time.includes('PM') && parseInt(m[1]) < 12 ? 12 : 0);
          }
          h += idx; // Shift for multiple tasks
          return `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`;
        };

        if (isTest) {
          newTasks.push({
            id: crypto.randomUUID(), title: `${subName} Test`, time: `${deadlineStr}, 8:00 AM`,
            type: "task", priority: "high", description: `• Exam day for ${subName}.`, resources: getResources(false)
          });
          for (let i = 1; i <= 2; i++) {
            const d = new Date(targetDeadline); d.setDate(d.getDate() - i);
            if (d >= today) {
              const t = getSlot(d, i - 1);
              newTasks.push({
                id: crypto.randomUUID(), title: `${subName} ${i === 1 ? 'Review' : 'Prep'}`, time: `${formatDate(d)}, ${t}`,
                duration: "1h", type: "study", priority: "medium",
                description: getStudyAdvice(subName, i === 1 ? 'final' : 'prep'), resources: getResources(true)
              });
            }
          }
          return resolve({ newTasks, message: `Perfect! I've mapped out a high-performance study plan for your **${subName}** test on ${deadlineStr}. You're going to crush it!` });
        }
      }

      // Default Greeting
      resolve({ newTasks: [], message: "I'm ready! Tell me about a test or homework you have coming up." });
    }, 800);
  });
};
