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
          const endH = parseInt(rangeMatch[3]);
          let ampm = (rangeMatch[4] || 'PM').toUpperCase();
          return { start: `${startH}:00 ${ampm}`, end: `${endH}:00 ${ampm}`, full: `${startH}:00 ${ampm} - ${endH}:00 ${ampm}`, hour: startH, ampm };
        }
        if (singleMatch) {
          const h = parseInt(singleMatch[1]);
          const m = singleMatch[2] || "00";
          const ampm = (singleMatch[3] || 'PM').toUpperCase();
          return { start: `${h}:${m} ${ampm}`, end: `${h + 1}:${m} ${ampm}`, full: `${h}:${m} ${ampm}`, hour: h, ampm };
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
      else if (lastUserLower.includes("yesterday")) { offset = -1; dateParsed = true; }
      else {
        // Find best match for day
        let foundDay = daysOfWeek.find(d => lastUserLower.includes(d));
        if (!foundDay) {
          // Check typos and common starts
          const typoKey = Object.keys(dayTypos).find(t => lastUserLower.includes(t));
          if (typoKey) foundDay = dayTypos[typoKey];
          else if (lastUserLower.includes("wen")) foundDay = "wednesday";
          else if (lastUserLower.includes("thr")) foundDay = "thursday";
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

      const matchedClasses = uniqueSubjects.map(s => {
        return schedule && schedule.find(c => c.name.toLowerCase().includes(s) || (c.subject && c.subject.toLowerCase().includes(s)));
      });

      const isAssignment = lastUserLower.includes("homework") || lastUserLower.includes("hw") || lastUserLower.includes("assignment") || lastUserLower.includes("due");
      const isTest = lastUserLower.includes("test") || lastUserLower.includes("exam") || lastUserLower.includes("quiz");
      const hasTaskMention = isTest || isAssignment || lastUserLower.includes("review") || lastUserLower.includes("study");

      // Stop Condition for missing class
      if (hasTaskMention && uniqueSubjects.length > 0) {
        const missingIdx = matchedClasses.findIndex(c => !c);
        if (missingIdx !== -1) {
          return resolve({
            newTasks: [],
            message: `I see you have a ${uniqueSubjects[missingIdx]} test coming up! What's the full name of that class in your schedule so I can add it correctly?`
          });
        }
      }

      // --- RESOURCES ---
      const getResources = (sub, isReview = false) => {
        const resources = [];
        if (isReview) resources.push({ label: "Study Coach (AI)", url: "https://www.playlab.ai/project/cmi7fu59u07kwl10uyroeqf8n" });
        resources.push({ label: "Quizlet", url: "https://quizlet.com" });
        return resources;
      };

      // --- OVERLAP PREVENTION ---
      let startHour = userTimePref ? userTimePref.hour : 16;
      const getSlotTime = () => {
        const ampm = startHour >= 12 ? "PM" : "AM";
        const h = startHour > 12 ? startHour - 12 : (startHour === 0 ? 12 : startHour);
        const timeStr = `${h}:00 ${ampm}`;
        startHour++; // Move to next slot
        return timeStr;
      };

      // --- MAIN SCHEDULING ---
      if (hasTaskMention && uniqueSubjects.length > 0) {
        const sub = matchedClasses[0].name;
        const deadlineStr = formatDate(targetDeadline);

        if (isAssignment) {
          const t = getSlotTime();
          newTasks = [{
            id: crypto.randomUUID(), title: `${sub} Work`, time: `${deadlineStr}, ${t}`,
            duration: "45m", type: "study", priority: "medium",
            description: `• Work for 45 minutes on ${sub}.`, resources: getResources(sub, true)
          }];
          return resolve({ newTasks, message: `Alright! I've added that ${sub} assignment for ${t} on ${deadlineStr}.` });
        } else if (isTest) {
          newTasks.push({
            id: crypto.randomUUID(), title: `${sub} Test`, time: `${deadlineStr}, 8:00 AM`,
            type: "task", priority: "high", description: `• Exam day for ${sub}. Good luck!`, resources: getResources(sub, false)
          });
          for (let i = 1; i <= 2; i++) {
            const d = new Date(targetDeadline); d.setDate(d.getDate() - i);
            if (d >= today) {
              const t = getSlotTime();
              newTasks.push({
                id: crypto.randomUUID(), title: `${sub} ${i === 1 ? 'Review' : 'Prep'}`, time: `${formatDate(d)}, ${t}`,
                duration: "1h", type: "study", priority: "medium",
                description: `• Spend an hour preparing for your ${sub} exam.`, resources: getResources(sub, true)
              });
            }
          }
          return resolve({ newTasks, message: `Got it! I've mapped out a study plan for your ${sub} test on ${deadlineStr}. I'll make sure you're ready!` });
        }
      }

      resolve({ newTasks: [], message: "Hey! I'm Calendly. Need a hand with your school schedule?" });
    }, 800);
  });
};
