document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('mainForm');
    const messageDiv = document.getElementById('formMessage');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // basic client-side validation
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
        messageDiv.classList.add('hidden');
        messageDiv.className = 'hidden'; // reset classes

        try {
            // Get reCAPTCHA token
            const token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, {action: 'submit'});
            
            // Gather form data
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            // Add metadata
            const payload = {
                siteId: SITE_ID,
                recaptchaToken: token,
                data: data,
                timestamp: new Date().toISOString()
            };

            // Send to Backend
            const response = await fetch(`${API_URL}/api/submit/${SITE_ID}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok) {
                messageDiv.textContent = 'Thank you! Your submission has been received. Please check your email for confirmation.';
                messageDiv.classList.remove('hidden');
                messageDiv.classList.add('success');
                form.reset();
            } else {
                throw new Error(result.message || 'Submission failed');
            }

        } catch (error) {
            console.error('Error:', error);
            messageDiv.textContent = `Error: ${error.message}. Please try again.`;
            messageDiv.classList.remove('hidden');
            messageDiv.classList.add('error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Request';
        }
    });
});
