# ContentForge: AI-Powered Enterprise Content Operations

Managing high-quality content at an enterprise scale is a lot of work. You're usually jumping between docs, legal teams, translation tools, and different social platforms. We built **ContentForge** to pull all of that into one automated pipeline, using AI agents to handle the heavy lifting while keeping you in the driver's seat.

## The Real-World Problem

In a typical enterprise, getting a high-quality piece of content out the door is a logistical nightmare. 

Imagine you're launching a new product. Usually, it looks like this:
1.  **Drafting**: A marketing manager writes a draft. (1 day)
2.  **Compliance & Legal**: It sits in a legal queue for 3 days to check for unsubstantiated claims or brand violations. (3 days)
3.  **Localization**: Once approved, it’s sent to a translation agency for 5 global regions. Idioms and tone are often lost in the process. (2 days)
4.  **Distribution**: A social media manager manually formats and posts it across LinkedIn, Twitter, Email, and the blog. (1 day)

By the time the content is actually live, the "moment" has often passed, and it’s cost the company a full week of manual back-and-forth. Worse, if one person misses a brand rule or a translation error, the consistency of the entire campaign is ruined.

**ContentForge** was built to turn this week-long manual process into a minutes-long automated pipeline that doesn't skip a single quality check.

## How it works: The Pipeline

Everything in ContentForge follows a **Pipeline**. Instead of one big "generate" button, your content moves through a series of stages:

1.  **Drafting**: The system takes your brief (or a document you uploaded) and creates a draft.
2.  **Review**: A separate agent checks that draft against your brand guidelines and legal constraints.
3.  **Localization**: If you’re targeting multiple countries, the content is adapted for those specific regions.
4.  **Distribution**: The final, approved version is sent out to your various channels.

At any point, you (the human) can step in. If the Reviewer agent says a draft is "too informal," you can see exactly why, edit the text yourself, or tell the AI to try again with better instructions.

## Meet your "Agents"

We didn't just build one AI; we built a team of specialized agents. Each has its own "personality" and set of rules:

*   **📝 The Drafter**: This agent is the creative one. It knows how to write for different formats—whether it’s a technical blog post, a snappy tweet, or a formal press release.
*   **✅ The Reviewer**: This is your quality control. It doesn't just look for typos; it checks your "Knowledge Base" (the facts about your company) to make sure the Drafter isn't just making things up.
*   **🌐 The Localizer**: Translating is easy, but *localizing* is hard. This agent understands that a joke in English might not work in Hindi, so it adapts the tone and cultural references accordingly.
*   **📢 The Publisher**: It knows the technical requirements for every platform. It ensures your LinkedIn post has the right hashtags and your Email newsletter has a compelling subject line.
*   **📊 The Intelligence Agent**: The real "brain." It looks at your analytics (clicks, shares, views) and tells you what’s actually working. For example, if it sees that videos are outperforming blog posts 4-to-1, it’ll suggest you pivot your strategy.

## Key "Smart" Features

*   **Document Ingestion**: You don't have to start from scratch. Upload a PDF, PowerPoint, or Word Doc, and the AI will "read" it first to make sure the content it writes is grounded in your actual research.
*   **Magic Briefs**: If you’re feeling lazy, just type a sentence like "I want a blog post about our new solar panels for engineers." The AI will automatically fill out the full content brief (tone, audience, key messages) for you.
*   **Brand & Knowledge Store**: You can save your brand's specific "rules" (like "never use emojis" or "always mention our warranty"). The Reviewer agent uses these rules to vet every single piece of content.

## Getting Started

### 1. Setup
You'll need Node.js installed and API keys for **Google Gemini** or **Groq**.

```bash
git clone https://github.com/manusingh090/ContentForge.git
cd ContentForge
npm install
```

### 2. Configure
Copy the `.env.example` to `.env` and add your keys:
```env
PORT=3000
GEMINI_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
```

### 3. Run it
```bash
npm run dev
```
Open your browser to `http://localhost:3000` and you're good to go.

---
*Built to help content teams move faster without losing the human touch.*
