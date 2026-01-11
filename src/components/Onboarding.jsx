import React, { useState, useEffect, useRef } from 'react';
import './Onboarding.css';

const tutorialSteps = [
    {
        title: "Welcome to Calendly!",
        body: "Let's take a quick tour to help you get organized. You can skip anytime.",
        targetId: null,
        position: 'center'
    },
    {
        title: "The Heart of Calendly",
        body: "First, let's head over to your Schedule tab to set up your week.",
        targetId: 'nav-schedule',
        position: 'right',
        view: 'schedule'
    },
    {
        title: "Add Your First Class",
        body: "Click '+ Add New Class' and add at least one subject. This helps the AI understand your assignments.",
        targetId: 'add-class-btn',
        position: 'bottom',
        require: 'schedule'
    },
    {
        title: "Map Your Routine",
        body: "Now, click '+ Add Routine Block' for things like Soccer, Work, or Sleep. The AI will never schedule study during these times!",
        targetId: 'add-routine-btn',
        position: 'bottom',
        require: 'activities'
    },
    {
        title: "AI Study Buddy",
        body: "Just ask! Type 'Plan my week' or 'I have a math test on Friday' to automate everything.",
        targetId: 'ai-chat-panel',
        position: 'left',
        view: 'home'
    },
    {
        title: "You're All Set!",
        body: "Your journey to better grades starts now. Personalized, automated, and effortless.",
        targetId: null,
        position: 'center'
    }
];

export default function Onboarding({ onFinish, isChatExpanded, schedule = [], activities = [], setView }) {
    const [step, setStep] = useState(0);
    const [coords, setCoords] = useState({ top: '50%', left: '50%' });
    const cardRef = useRef(null);

    const updatePosition = () => {
        const currentData = tutorialSteps[step];

        // Handle View Switching
        if (currentData.view && setView) {
            setView(currentData.view);
        }

        let targetId = currentData.targetId;

        // Smart Re-targeting for modals
        if (targetId === 'add-class-btn' && document.getElementById('class-form')) {
            targetId = 'class-form';
        } else if (targetId === 'add-routine-btn' && document.getElementById('routine-form')) {
            targetId = 'routine-form';
        }

        if (!targetId) {
            setCoords({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
            return;
        }

        const el = document.getElementById(targetId);
        if (el) {
            const rect = el.getBoundingClientRect();
            let newCoords = {};
            const padding = 20;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Different positioning for forms vs buttons
            if (targetId.includes('form')) {
                newCoords = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
            } else {
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
            }
            setCoords(newCoords);

            // Add highlight class
            document.querySelectorAll('.highlight-element').forEach(item => item.classList.remove('highlight-element'));
            el.classList.add('highlight-element');
        } else {
            // Fallback if element not found yet (e.g. view transition)
            setCoords({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
        }
    };

    useEffect(() => {
        // Use a small timeout to let the layout shift complete
        const timer = setTimeout(updatePosition, 100);
        window.addEventListener('resize', updatePosition);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updatePosition);
            document.querySelectorAll('.highlight-element').forEach(item => item.classList.remove('highlight-element'));
        };
    }, [step, isChatExpanded, schedule.length, activities.length, setView]);

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
    const isLocked = (currentStep.require === 'schedule' && schedule.length === 0) ||
        (currentStep.require === 'activities' && activities.length === 0);

    return (
        <div className="tutorial-overlay">
            <div
                ref={cardRef}
                className={`tutorial-card pos-${currentStep.position}`}
                style={coords}
            >
                <div className="tutorial-header">
                    <div className="tutorial-icon">{isLocked ? '🔒' : '✨'}</div>
                    <div className="tutorial-title">{currentStep.title}</div>
                </div>
                <div className="tutorial-body">
                    {currentStep.body}
                    {isLocked && (
                        <div style={{ color: '#ffb300', fontSize: '0.8rem', marginTop: '12px', fontWeight: '600' }}>
                            ⚠️ Please add at least one to continue.
                        </div>
                    )}
                </div>
                <div className="tutorial-footer">
                    <div className="tutorial-steps">
                        {step + 1} of {tutorialSteps.length}
                    </div>
                    <div className="tutorial-btns">
                        {step > 0 && <button className="tut-skip-btn" onClick={handleBack}>Back</button>}
                        {step === 0 && <button className="tut-skip-btn" onClick={onFinish}>Skip</button>}
                        <button
                            className="tut-next-btn"
                            onClick={handleNext}
                            disabled={isLocked}
                            style={{ opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : 'pointer' }}
                        >
                            {step === tutorialSteps.length - 1 ? "Finish" : "Next"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
