const PDFDocument = require('pdfkit');

/**
 * Generates a PDF buffer from submission data
 * @param {Object} data - The form submission data
 * @param {string} siteId - The ID of the site
 * @returns {Promise<Buffer>}
 */
const generatePDF = (data, siteId) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header
      doc.fontSize(25).text('Submission Receipt', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Site ID: ${siteId}`, { align: 'right' });
      doc.text(`Date: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown();

      // Divider
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      // Content
      doc.fontSize(14).text('Submission Details:', { underline: true });
      doc.moveDown();

      Object.entries(data).forEach(([key, value]) => {
        // Skip internal or empty fields
        if (key === 'recaptchaToken') return;
        
        doc.fontSize(12).font('Helvetica-Bold').text(`${key}:`, { continued: true });
        doc.font('Helvetica').text(`  ${value}`);
        doc.moveDown(0.5);
      });

      // Footer
      doc.moveDown(2);
      doc.fontSize(10).text('Thank you for your business.', { align: 'center', color: 'grey' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generatePDF };
