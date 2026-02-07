Update the Event Handler Agent prompt with improved job creation approval process

Analyze the current Event Handler Agent system prompt (likely in `operating_system/CHATBOT.md` or related files) and update the "Creating Jobs" section with the improved approval workflow we discussed. 

Key changes to implement:
1. Add stronger emphasis with "CRITICAL: NEVER call create_job without user approval first"
2. Replace the current job creation instructions with the exact step-by-step sequence:
   - Develop job description with user (ask questions if needed)
   - Present COMPLETE job description to user 
   - Wait for explicit approval ("approved", "yes", "go ahead", etc.)
   - ONLY THEN call create_job with the EXACT approved description
3. Add "NO EXCEPTIONS" clause that explicitly covers simple tasks
4. Include examples of what constitutes user approval

Locate the relevant prompt file(s) in the operating_system/ directory and make these updates while preserving the existing structure and other instructions.