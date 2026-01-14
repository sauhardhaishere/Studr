/**
 * Search Service for the AI to find real-time study strategies.
 * Uses Tavily API (https://tavily.com/) for AI-optimized web search.
 */
export const searchWebForStrategy = async (subject) => {
    const apiKey = import.meta.env.VITE_TAVILY_API_KEY;

    if (!apiKey) {
        console.warn("No TAVILY_API_KEY found in .env. Falling back to internal knowledge.");
        return null;
    }

    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                api_key: apiKey,
                query: `best study schedule and prep resources for ${subject} exam 2026`,
                search_depth: "advanced",
                include_answers: true,
                max_results: 3
            }),
        });

        if (!response.ok) {
            throw new Error(`Tavily API error: ${response.status}`);
        }

        const data = await response.json();
        return {
            answer: data.answer,
            results: data.results.map(r => ({ label: r.title, url: r.url }))
        };
    } catch (error) {
        console.error("Search failed:", error);
        return null;
    }
};
