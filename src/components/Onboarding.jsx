import React, { useState } from 'react';
import './Onboarding.css';

const ChevronRight = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
);

const LogoIcon = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);

const steps = [
    {
        title: "Welcome to Studr",
        description: "The intelligent way to manage your academic life. Let's get you set up in less than 2 minutes.",
        icon: <LogoIcon />,
        visual: (
            <div className="visual-demo">
                <div className="demo-item fill" style={{ width: '80%' }}></div>
                <div className="demo-item" style={{ width: '60%' }}></div>
                <div className="demo-item fill" style={{ width: '90%' }}></div>
            </div>
        )
    },
    {
        title: "Sync Your Schedule",
        description: "Go to the Schedule tab to add your classes. Studr uses this to find the best times for you to study.",
        icon: (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        ),
        visual: (
            <div className="schedule-preview">
                <div className="preview-pill"></div>
                <div className="preview-pill" style={{ animationDelay: '0.2s' }}></div>
                <div className="preview-pill" style={{ animationDelay: '0.4s' }}></div>
            </div>
        )
    },
    {
        title: "Meet Your AI Assistant",
        description: "Type anything like 'I have a math test on Friday' and Studr will automatically build a study plan for you.",
        icon: (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        ),
        visual: (
            <div className="chat-preview">
                <div className="chat-msg user">Math test on Friday!</div>
                <div className="chat-msg ai">I've scheduled 3 study sessions for your Math test. Good luck!</div>
            </div>
        )
    },
    {
        title: "Plan with Precision",
        description: "Prefer manual control? Use the '+ Add New Task' button to quickly log assignments and set priority levels.",
        icon: (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        ),
        visual: (
            <div className="visual-demo">
                <div className="demo-item fill" style={{ width: '70%', background: 'rgba(255, 255, 255, 0.2)' }}></div>
                <div className="demo-item fill" style={{ width: '40%', background: 'rgba(255, 255, 255, 0.2)', marginTop: '8px' }}></div>
            </div>
        )
    },
    {
        title: "Ready to Ace It?",
        description: "Your journey to better grades starts now. Personalized, automated, and effortless.",
        icon: (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        ),
        visual: (
            <div className="visual-demo">
                <div className="demo-item fill" style={{ width: '100%', background: 'linear-gradient(90deg, #10b981, #34d399)' }}></div>
                <div className="demo-item fill" style={{ width: '100%', background: 'linear-gradient(90deg, #10b981, #34d399)', animationDelay: '0.5s' }}></div>
            </div>
        )
    }
];

export default function Onboarding({ onFinish }) {
    const [currentStep, setCurrentStep] = useState(0);

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            onFinish();
        }
    };

    const handleSkip = () => {
        onFinish();
    };

    const step = steps[currentStep];
    const progress = ((currentStep + 1) / steps.length) * 100;

    return (
        <div className="onboarding-overlay">
            <div className="onboarding-card">
                <div className="onboarding-progress" style={{ width: `${progress}%` }}></div>

                <div className="onboarding-content" key={currentStep}>
                    <div className="onboarding-icon-wrapper">
                        {step.icon}
                    </div>
                    <h2>{step.title}</h2>
                    <p>{step.description}</p>

                    <div className="onboarding-visual">
                        {step.visual}
                    </div>
                </div>

                <div className="onboarding-footer">
                    <button className="skip-btn" onClick={handleSkip}>
                        Skip Tutorial
                    </button>
                    <button className="next-btn" onClick={handleNext}>
                        {currentStep === steps.length - 1 ? "Get Started" : "Continue"}
                        <ChevronRight />
                    </button>
                </div>
            </div>
        </div>
    );
}
