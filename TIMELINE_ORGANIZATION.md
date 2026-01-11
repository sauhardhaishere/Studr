# Timeline Organization - Visual Example

## How the New Timeline Looks

The timeline is now organized into smart sections that group your tasks by when they're due. This makes it much easier to see what you need to focus on right now vs. what's coming up later.

## Example: After Creating a Chunked Study Plan

**User says:** "I have a Chem midterm in 2 weeks and I have practice every day until 6"

**The Timeline Will Show:**

```
┌─────────────────────────────────────────────────────────┐
│  Good Afternoon, Alex                                   │
│  8 tasks remaining.                                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Stats                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │   87%    │  │    8     │  │    8h    │             │
│  │Study Goal│  │Tasks Left│  │Sleep Tgt │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  THIS WEEK                                              │
│  ═══════════════════════════════════════════════════════│
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Chem Review - Chapter 1                  [High] │   │
│  │ Next Saturday • 45m                       [Done]│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Chem Review - Chapter 2                         │   │
│  │ Next Sunday • 45m                         [Done]│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  NEXT WEEK                                              │
│  ═══════════════════════════════════════════════════════│
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Chem Review - Practice Problems                 │   │
│  │ Next Monday • 20m                         [Done]│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Chem Review - Equations                         │   │
│  │ Next Tuesday • 20m                        [Done]│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Chem Review - Key Concepts                      │   │
│  │ Next Wednesday • 20m                      [Done]│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Chem Review - Final Review            [High]    │   │
│  │ Next Friday • 30m                         [Done]│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Chem Midterm                          [High]    │   │
│  │ Next Saturday • 45m                       [Done]│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Benefits

### 1. **Clear Visual Hierarchy**
- Tasks are automatically grouped by urgency
- You can immediately see what needs attention today vs. later
- No more scrolling through a long list to find urgent items

### 2. **Smart Categorization**
The system automatically detects:
- **"Today"** - Any task with "Today" in the time
- **"This Week"** - Tasks with "Tomorrow" or within the next 7 days
- **"Next Week"** - Tasks scheduled for the following week
- **"Later"** - Everything else (monthly tasks, far future items)

### 3. **Perfect for Chunked Study Plans**
When the AI creates multiple study sessions:
- Weekend sessions appear in "This Week" or "Next Week"
- Weekday sessions are properly distributed
- You can see the entire study plan at a glance
- Easy to track progress as you complete each chunk

### 4. **Calendar Integration**
All these tasks also appear in the Calendar view:
- Click the Calendar tab to see them on specific dates
- Visual representation of your study schedule
- See how tasks fit around your other commitments

## Example Scenarios

### Scenario 1: Mixed Tasks
```
TODAY
─────
• Math Homework - Today, 3:00 PM • 30m

THIS WEEK
─────────
• AP Bio Test - Tomorrow • 45m
• History Essay - Next Friday • 2h

NEXT WEEK
─────────
• Physics Lab Report - Next Monday • 1h
• Spanish Quiz - Next Wednesday • 30m

LATER
─────
• Final Project - Jan 25 • 3h
```

### Scenario 2: Just Started (Empty State)
```
No tasks yet. Chat with Calendly to get started!
```

### Scenario 3: Only Today's Tasks
```
TODAY
─────
• Math Quiz - Today, 2:00 PM • 45m
• Soccer Practice - Today, 4:00 PM • 2h
```

## How It Works Technically

The timeline uses intelligent date parsing:
1. Checks if task time includes "today" → **Today** section
2. Checks if task time includes "tomorrow" → **This Week** section
3. Checks if task time includes "next" + day of week → **Next Week** section
4. Checks if task time includes month names → **Later** section
5. Falls back to **This Week** for any day-of-week mention

This ensures all your chunked study sessions appear in the right place automatically!
