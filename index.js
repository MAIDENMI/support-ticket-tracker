// Support Ticket Tracker API
// Express server that reads and writes tickets in MongoDB Atlas.

require("dotenv").config(); // loads MONGODB_URI from the .env file (local only)
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(express.json()); // lets the API read JSON request bodies

// One client for the whole app. It keeps a pool of open connections to Atlas.
const client = new MongoClient(process.env.MONGODB_URI);
let tickets; // the "tickets" collection, set once we connect

// 1. Health check: confirms the API is running and can reach the database
app.get("/health", async (req, res) => {
  await client.db("admin").command({ ping: 1 });
  res.json({ status: "ok" });
});

// 2. List open tickets, optionally filtered by priority
//    Example: GET /tickets/open?priority=urgent
//    Uses the status_1_priority_1 compound index we created on Day 3
app.get("/tickets/open", async (req, res) => {
  const filter = { status: "open" };
  if (req.query.priority) filter.priority = req.query.priority;

  const results = await tickets
    .find(filter, { projection: { comments: 0 } }) // skip comments to keep the list small
    .limit(50)
    .toArray();
  res.json({ count: results.length, tickets: results });
});

// 3. Create a new ticket
//    Body: { "customerName": "...", "title": "...", "category": "...", "priority": "..." }
app.post("/tickets", async (req, res) => {
  const { customerId, customerName, title, category, priority } = req.body;
  if (!customerName || !title || !priority) {
    return res.status(400).json({ error: "customerName, title and priority are required" });
  }

  const ticket = {
    customerId: customerId ? new ObjectId(customerId) : null,
    customerName,
    title,
    category: category || "how-to",
    status: "open",
    priority,
    createdAt: new Date(),
    comments: [],
  };
  const result = await tickets.insertOne(ticket);
  res.status(201).json({ _id: result.insertedId, ...ticket });
});

// 4. Close a ticket by its ID
//    Example: PATCH /tickets/6ad53dc64413ef603789b9dd/close
app.patch("/tickets/:id/close", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid ticket ID" });
  }
  const result = await tickets.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status: "closed", closedAt: new Date() } }
  );
  if (result.matchedCount === 0) return res.status(404).json({ error: "Ticket not found" });
  res.json({ message: "Ticket closed" });
});

// Start: connect to Atlas first, then start listening for requests
const PORT = process.env.PORT || 8080; // Cloud Run sets PORT automatically
async function start() {
  await client.connect();
  tickets = client.db("support").collection("tickets");
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
}
start().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
