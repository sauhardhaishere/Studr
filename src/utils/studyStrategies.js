export const testStrategies = {
    sat: {
        advice: "• Digital Adaptive Strategy: The SAT modules adapt based on your performance. Focus on accuracy in Module 1 to unlock a higher score potential in Module 2.\n• Math: Use the built-in Desmos calculator for complex functions. Prioritize algebra and data analysis questions.\n• Reading/Writing: Focus on vocabulary in context. Passages are shorter, so look for the one main idea quickly.\n• Practice: Review every mistake meticulously to identify patterns in logical reasoning.",
        resources: [
            { label: "Bluebook (College Board)", url: "https://bluebook.collegeboard.org/" },
            { label: "Khan Academy SAT", url: "https://www.khanacademy.org/test-prep/sat" }
        ]
    },
    act: {
        advice: "• Formatting Strategy: ACT has fewer questions but more time now. Take advantage of the 4-choice math options.\n• Core Focus: Prioritize English, Math, and Reading. Science is now optional for the composite score.\n• English: Favor conciseness. If an answer is clear and short, it's often correct.\n• Math: Focus on pre-algebra and geometry. There's no penalty for guessing, so never leave a blank!",
        resources: [
            { label: "ACT Academy", url: "https://www.act.org/content/act/en/products-and-services/the-act/test-preparation/act-academy.html" },
            { label: "Official Prep Guide", url: "https://www.act.org/content/act/en/products-and-services/the-act/test-preparation.html" }
        ]
    },
    general: {
        advice: "• Spaced Repetition: Don't cram. Your brain retains info best when sessions are spread 1-2 days apart.\n• Active Recall: Instead of re-reading notes, cover them and try to explain concepts out loud.\n• Error Log: Maintain a list of every problem you missed and why you missed it.",
        resources: [
            { label: "Knowt", url: "https://knowt.com" },
            { label: "Quizlet", url: "https://quizlet.com" }
        ]
    }
};

export const getStrategyForSubject = (subject) => {
    const s = subject.toLowerCase();
    if (s.includes('sat')) return testStrategies.sat;
    if (s.includes('act')) return testStrategies.act;
    return testStrategies.general;
};
