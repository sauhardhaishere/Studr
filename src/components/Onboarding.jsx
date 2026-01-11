import React, { useState, useEffect, useRef } from 'react';
import './Onboarding.css';

const tutorialSteps = [
    {
        title: "Welcome to Calendly!",
        body: "Let's take a quick tour to help you get organized. You can skip anytime.",
        targetId: null, // Center of screen
        position: 'center'
    },
    {
        title: "Manage Classes",
        body: "Add your subjects and schedule here. This helps the AI know when you're busy.",
        targetId: 'nav-schedule',
        position: 'right'
    },
    {
        title: "Plan Your Tests",
        body: "Click here to manually add tests or assignments. We'll build a study plan around them.",
        targetId: 'add-task-btn',
        position: 'bottom'
    },
    {
        title: "AI Study Buddy",
        body: "Just ask! Type 'Plan my week' or 'I have a math test on Friday' to automate everything.",
        targetId: 'ai-chat-panel',
        position: 'left'
    },
    {
        title: "Visual Calendar",
        body: "See your whole month at a glance. Every study session and class is automatically mapped.",
        targetId: 'nav-calendar',
        position: 'right'
    }
];

export default function Onboarding({ onFinish, isChatExpanded }) {
    const [step, setStep] = useState(0);
    const [coords, setCoords] = useState({ top: '50%', left: '50%' });
    const cardRef = useRef(null);

    const updatePosition = () => {
        const currentData = tutorialSteps[step];
        if (!currentData.targetId) {
            setCoords({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
            return;
        }

        const el = document.getElementById(currentData.targetId);
        if (el) {
            const rect = el.getBoundingClientRect();
            let newCoords = {};
            const padding = 20;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            switch (currentData.position) {
                case 'right':
                    newCoords = {
                        top: Math.max(padding, Math.min(viewportHeight - 200, rect.top + rect.height / 2)),
                        left: Math.min(viewportWidth - 340, rect.right + 20),
                        transform: 'translateY(-50%)'
                    };
                    break;
                case 'left':
                    newCoords = {
                        top: Math.max(padding, Math.min(viewportHeight - 200, rect.top + rect.height / 2)),
                        left: Math.max(padding, rect.left - 340),
                        transform: 'translateY(-50%)'
                    };
                    break;
                case 'bottom':
                    newCoords = {
                        top: rect.bottom + 20,
                        left: Math.max(160, Math.min(viewportWidth - 160, rect.left + rect.width / 2)),
                        transform: 'translateX(-50%)'
                    };
                    break;
                case 'top':
                    newCoords = {
                        top: Math.max(padding, rect.top - 200),
                        left: Math.max(160, Math.min(viewportWidth - 160, rect.left + rect.width / 2)),
                        transform: 'translateX(-50%)'
                    };
                    break;
                default:
                    newCoords = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
            }
            setCoords(newCoords);

            // Add highlight class
            document.querySelectorAll('.highlight-element').forEach(item => item.classList.remove('highlight-element'));
            el.classList.add('highlight-element');
        }
    };

    useEffect(() => {
        // Use a small timeout to let the layout shift complete if needed
        const timer = setTimeout(updatePosition, 100);
        window.addEventListener('resize', updatePosition);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updatePosition);
            document.querySelectorAll('.highlight-element').forEach(item => item.classList.remove('highlight-element'));
        };
    }, [step, isChatExpanded]);

    const handleNext = () => {
        if (step < tutorialSteps.length - 1) {
            setStep(step + 1);
        } else {
            onFinish();
        }
    };

    const handleBack = () => {
        if (step > 0) {
            setStep(step - 1);
        }
    };

    const currentStep = tutorialSteps[step];

    return (
        <div className="tutorial-overlay">
            <div
                ref={cardRef}
                className={`tutorial-card pos-${currentStep.position}`}
                style={coords}
            >
                <div className="tutorial-header">
                    <div className="tutorial-icon">✨</div>
                    <div className="tutorial-title">{currentStep.title}</div>
                </div>
                <div className="tutorial-body">
                    {currentStep.body}
                </div>
                <div className="tutorial-footer">
                    <div className="tutorial-steps">
                        {step + 1} of {tutorialSteps.length}
                    </div>
                    <div className="tutorial-btns">
                        {step > 0 && <button className="tut-skip-btn" onClick={handleBack}>Back</button>}
                        {step === 0 && <button className="tut-skip-btn" onClick={onFinish}>Skip</button>}
                        <button className="tut-next-btn" onClick={handleNext}>
                            {step === tutorialSteps.length - 1 ? "Finish" : "Next"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
