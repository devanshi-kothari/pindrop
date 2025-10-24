import React, { useState } from 'react';
import './App.css';

function App() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission here
    console.log('Form submitted:', { email, password, isSignUp });
  };

  return (
    <div className="app">
      <div className="auth-container">
        <div className="auth-form">
          <h1 className="auth-title">
            {isSignUp ? 'Create Account' : 'Sign in - test change'}
          </h1>
          
          <form onSubmit={handleSubmit} className="form">
            <div className="input-group">
              <label htmlFor="email" className="input-label">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="Enter your email"
                required
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="password" className="input-label">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter your password"
                required
              />
            </div>
            
            <button type="submit" className="submit-button">
              {isSignUp ? 'Sign up' : 'Sign in'}
            </button>
          </form>
          
          <div className="auth-links">
            <a href="#" className="forgot-password">
              Forgot password?
            </a>
            
            <div className="signup-link">
              <span>Don't have an account? </span>
              <button 
                onClick={() => setIsSignUp(!isSignUp)}
                className="link-button"
              >
                Sign up
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
