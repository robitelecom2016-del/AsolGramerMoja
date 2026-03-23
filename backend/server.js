// server.js (updated with SEO fields and sitemap)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      heartbeatFrequencyMS: 10000,
    });
    isConnected = true;
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected. Reconnecting...');
  isConnected = false;
  setTimeout(connectDB, 3000);
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
  isConnected = false;
});

connectDB();

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^\u0980-\u09FFa-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, default: 'Admin' },
  createdAt: { type: Date, default: Date.now },
});
const Admin = mongoose.model('Admin', adminSchema);

const categorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  lbl: { type: String, required: true },
  em: { type: String, default: '🛒' },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});
const Category = mongoose.model('Category', categorySchema);

const productSchema = new mongoose.Schema({
  cat: { type: String, required: true },
  nm: { type: String, required: true },
  sub: { type: String, default: '' },
  em: { type: String, default: '🛒' },
  bg: { type: String, default: '#c8a55a' },
  best: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  phone: { type: String, default: '01712345678' },
  img: { type: String, default: '' },
  imgPublicId: { type: String, default: '' },
  imgs: [{ type: String }],
  imgsPublicIds: [{ type: String }],
  desc: { type: String, default: '' },
  highlights: [{ type: String }],
  variants: [{
    lbl: String,
    p: Number,
    bp: Number,
    op: Number,
    disc: String,
    stock: { type: Number, default: 0 },  // প্রতি ভ্যারিয়েন্টের স্টক
  }],
  stockQuantity: { type: Number, default: 0 },  // মোট স্টক পরিমাণ
  metaTitle: { type: String, default: '' },
  metaDescription: { type: String, default: '' },
  slug: { type: String, unique: true, sparse: true },
  stockOut: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
  orderNum: { type: String, required: true, unique: true },
  items: [{
    productId: String,
    nm: String,
    varLabel: String,
    qty: Number,
    cartPrice: Number,
    buyPrice: Number,
    em: String,
    img: String,
  }],
  customer: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    note: String,
  },
  delivery: {
    type: { type: String },
    charge: Number,
  },
  advanceDelivery: {
    paid: { type: Boolean, default: false },
    trxId: { type: String, default: '' },
    amount: { type: Number, default: 0 },
  },
  subtotal: Number,
  total: Number,
  totalBuyCost: { type: Number, default: 0 },
  totalProfit: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  statusHistory: [{
    status: String,
    note: String,
    time: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Order = mongoose.model('Order', orderSchema);

const heroSchema = new mongoose.Schema({
  title: String,
  subtitle: String,
  gradient: { type: String, default: 's1' },
  img: { type: String, default: '' },
  imgPublicId: { type: String, default: '' },
  ctaText: { type: String, default: '' },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});
const Hero = mongoose.model('Hero', heroSchema);

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now },
});
const Settings = mongoose.model('Settings', settingsSchema);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ওয়েবসাইট খরচ ট্র্যাকার Schema
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const websiteCostSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['creation', 'update', 'maintenance', 'domain', 'hosting', 'other'],
    required: true,
  },
  // creation = তৈরি খরচ, update = আপডেট, maintenance = রক্ষণাবেক্ষণ
  // domain = ডোমেইন, hosting = হোস্টিং, other = অন্যান্য
  title: { type: String, required: true },        // সংক্ষিপ্ত বিবরণ
  amount: { type: Number, required: true },        // টাকার পরিমাণ
  date: { type: Date, required: true },            // তারিখ
  description: { type: String, default: '' },      // বিস্তারিত বিবরণ
  status: {
    type: String,
    enum: ['paid', 'pending', 'partial'],
    default: 'paid',
  },
  paidAmount: { type: Number, default: 0 },        // পরিশোধিত পরিমাণ (partial-এর ক্ষেত্রে)
  developer: { type: String, default: '' },        // ডেভেলপার/ভেন্ডর
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const WebsiteCost = mongoose.model('WebsiteCost', websiteCostSchema);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics Schema — ভিজিটর ও প্রোডাক্ট ক্লিক
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const pageViewSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD
  count: { type: Number, default: 0 },
});
const PageView = mongoose.model('PageView', pageViewSchema);

const productClickSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  count: { type: Number, default: 0 },
});
productClickSchema.index({ productId: 1, date: 1 }, { unique: true });
const ProductClick = mongoose.model('ProductClick', productClickSchema);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// স্টক লগ Schema — ক্রয় ও বিক্রয় ইতিহাস
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const stockLogSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  type: { type: String, enum: ['purchase', 'sale', 'adjustment'], required: true },
  // purchase = কেনা, sale = বিক্রি, adjustment = ম্যানুয়াল সমন্বয়
  qty: { type: Number, required: true },           // পরিমাণ
  stockBefore: { type: Number, default: 0 },       // আগে কত ছিল
  stockAfter: { type: Number, default: 0 },        // পরে কত হলো
  note: { type: String, default: '' },             // নোট
  date: { type: Date, default: Date.now },
  createdBy: { type: String, default: 'admin' },
});
const StockLog = mongoose.model('StockLog', stockLogSchema);

const memStorage = multer.memoryStorage();
const upload = multer({ storage: memStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadThumb = multer({ storage: memStorage, limits: { fileSize: 5 * 1024 * 1024 } });

async function uploadToCloudinary(buffer, folder, transformation) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, transformation, allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'asolgramer_secret_2024');
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const dbMiddleware = async (req, res, next) => {
  if (!isConnected) await connectDB();
  next();
};
app.use(dbMiddleware);

const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(async () => {
  try {
    const https = require('https');
    const http = require('http');
    const url = new URL(SELF_URL + '/api/health');
    const client = url.protocol === 'https:' ? https : http;
    client.get(url.href, (res) => {
      res.resume();
      console.log(`🏓 Keep-alive ping: ${res.statusCode}`);
    }).on('error', () => {});
  } catch {}
}, 14 * 60 * 1000);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: isConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    time: new Date().toISOString(),
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    let admin = await Admin.findOne({ username });
    if (!admin && username === 'admin') {
      const hashed = await bcrypt.hash('admin123', 10);
      admin = await Admin.create({ username: 'admin', password: hashed, name: 'Super Admin' });
    }
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: admin._id, username: admin.username, name: admin.name },
      process.env.JWT_SECRET || 'asolgramer_secret_2024',
      { expiresIn: '7d' }
    );
    res.json({ token, admin: { username: admin.username, name: admin.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin.id);
    const valid = await bcrypt.compare(currentPassword, admin.password);
    if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { cat, best, active = 'true', limit, page = 1 } = req.query;
    const filter = {};
    if (active !== 'all') filter.active = active === 'true';
    if (cat && cat !== 'all') filter.cat = cat;
    if (best === 'true') filter.best = true;
    const total = await Product.countDocuments(filter);
    let query = Product.find(filter).sort({ order: 1, createdAt: -1 });
    if (limit) {
      const lim = parseInt(limit);
      const skip = (parseInt(page) - 1) * lim;
      query = query.skip(skip).limit(lim);
    }
    const products = await query;
    res.json({ products, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', authMiddleware, async (req, res) => {
  try {
    if (!req.body.slug && req.body.nm) {
      req.body.slug = generateSlug(req.body.nm);
    }
    const product = await Product.create({ ...req.body, updatedAt: new Date() });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    if (!req.body.slug && req.body.nm) {
      req.body.slug = generateSlug(req.body.nm);
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const imageIds = [product.imgPublicId, ...product.imgsPublicIds].filter(Boolean);
    for (const id of imageIds) {
      try {
        await cloudinary.uploader.destroy(id);
      } catch (err) {
        console.error(`Failed to delete image ${id}:`, err.message);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/products/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    product.active = !product.active;
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/products/:id/best', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    product.best = !product.best;
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/products/:id/stockout', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    product.stockOut = !product.stockOut;
    product.updatedAt = new Date();
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// স্টক ম্যানেজমেন্ট Routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// একটি পণ্যের স্টক আপডেট (admin only)
app.patch('/api/products/:id/stock', authMiddleware, async (req, res) => {
  try {
    const { stockQuantity, variants } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // মোট স্টক আপডেট
    if (stockQuantity !== undefined) {
      product.stockQuantity = Math.max(0, parseInt(stockQuantity) || 0);
    }

    // ভ্যারিয়েন্ট স্টক আপডেট
    if (variants && Array.isArray(variants)) {
      variants.forEach(({ lbl, stock }) => {
        const vIdx = product.variants.findIndex(v => v.lbl === lbl);
        if (vIdx !== -1) {
          product.variants[vIdx].stock = Math.max(0, parseInt(stock) || 0);
        }
      });
      // ভ্যারিয়েন্ট থেকে মোট স্টক হিসাব (যদি stockQuantity না পাঠানো হয়)
      if (stockQuantity === undefined) {
        product.stockQuantity = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      }
    }

    // স্টক > 0 হলে stockOut = false, স্টক = 0 হলে stockOut = true
    product.stockOut = product.stockQuantity <= 0;
    product.updatedAt = new Date();
    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// সব পণ্যের স্টক সারাংশ (admin only)
app.get('/api/stock/summary', authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({ active: true })
      .select('nm em cat stockQuantity stockOut variants img')
      .sort({ stockQuantity: 1 }); // কম স্টক আগে

    const lowStockThreshold = parseInt(req.query.threshold) || 10;

    const summary = {
      total: products.length,
      inStock: products.filter(p => !p.stockOut && p.stockQuantity > 0).length,
      outOfStock: products.filter(p => p.stockOut || p.stockQuantity <= 0).length,
      lowStock: products.filter(p => p.stockQuantity > 0 && p.stockQuantity <= lowStockThreshold).length,
      totalUnits: products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0),
      products: products.map(p => ({
        _id: p._id,
        nm: p.nm,
        em: p.em,
        cat: p.cat,
        img: p.img,
        stockQuantity: p.stockQuantity || 0,
        stockOut: p.stockOut,
        isLow: p.stockQuantity > 0 && p.stockQuantity <= lowStockThreshold,
        variants: p.variants.map(v => ({ lbl: v.lbl, stock: v.stock || 0 })),
      })),
    };

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// একসাথে অনেক পণ্যের স্টক আপডেট — bulk (admin only)
app.patch('/api/stock/bulk', authMiddleware, async (req, res) => {
  try {
    const { updates } = req.body; // [{productId, stockQuantity, variants:[{lbl, stock}]}]
    if (!Array.isArray(updates) || !updates.length) {
      return res.status(400).json({ error: 'Updates array required' });
    }

    const results = [];
    for (const upd of updates) {
      try {
        const product = await Product.findById(upd.productId);
        if (!product) continue;

        if (upd.stockQuantity !== undefined) {
          product.stockQuantity = Math.max(0, parseInt(upd.stockQuantity) || 0);
        }
        if (upd.variants && Array.isArray(upd.variants)) {
          upd.variants.forEach(({ lbl, stock }) => {
            const vIdx = product.variants.findIndex(v => v.lbl === lbl);
            if (vIdx !== -1) product.variants[vIdx].stock = Math.max(0, parseInt(stock) || 0);
          });
          if (upd.stockQuantity === undefined) {
            product.stockQuantity = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
          }
        }

        product.stockOut = product.stockQuantity <= 0;
        product.updatedAt = new Date();
        await product.save();
        results.push({ productId: upd.productId, success: true, stockQuantity: product.stockQuantity });
      } catch (e) {
        results.push({ productId: upd.productId, success: false, error: e.message });
      }
    }

    res.json({ success: true, updated: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// স্টক লগ Routes — ক্রয়/বিক্রয় ট্র্যাকিং
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// স্টক লগ তৈরি করো (কেনা বা বিক্রি রেকর্ড)
app.post('/api/stock/log', authMiddleware, async (req, res) => {
  try {
    const { productId, type, qty, note } = req.body;
    if (!productId || !type || !qty) {
      return res.status(400).json({ error: 'productId, type, qty প্রয়োজন' });
    }
    if (!['purchase', 'sale', 'adjustment'].includes(type)) {
      return res.status(400).json({ error: 'type হবে: purchase, sale, অথবা adjustment' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'পণ্য পাওয়া যায়নি' });

    const stockBefore = product.stockQuantity || 0;
    let stockAfter;

    if (type === 'purchase') {
      stockAfter = stockBefore + Math.abs(parseInt(qty));
    } else if (type === 'sale') {
      stockAfter = Math.max(0, stockBefore - Math.abs(parseInt(qty)));
    } else {
      // adjustment — সরাসরি সেট করা
      stockAfter = Math.max(0, parseInt(qty));
    }

    // পণ্যের স্টক আপডেট
    product.stockQuantity = stockAfter;
    product.stockOut = stockAfter <= 0;
    product.updatedAt = new Date();
    await product.save();

    // লগ তৈরি
    const log = await StockLog.create({
      productId,
      productName: product.nm,
      type,
      qty: Math.abs(parseInt(qty)),
      stockBefore,
      stockAfter,
      note: note || '',
      createdBy: req.admin?.username || 'admin',
    });

    res.status(201).json({ success: true, log, stockAfter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// একটি পণ্যের স্টক লগ দেখো
app.get('/api/stock/log/:productId', authMiddleware, async (req, res) => {
  try {
    const logs = await StockLog.find({ productId: req.params.productId })
      .sort({ date: -1 })
      .limit(100);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// সব পণ্যের স্টক লগ (সারাংশ + ফিল্টার)
app.get('/api/stock/logs', authMiddleware, async (req, res) => {
  try {
    const { productId, type, days = 30, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (productId) filter.productId = productId;
    if (type) filter.type = type;
    if (days) {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(days));
      filter.date = { $gte: since };
    }
    const total = await StockLog.countDocuments(filter);
    const logs = await StockLog.find(filter)
      .sort({ date: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // সারাংশ
    const totalPurchased = await StockLog.aggregate([
      { $match: { ...filter, type: 'purchase' } },
      { $group: { _id: null, total: { $sum: '$qty' } } }
    ]);
    const totalSold = await StockLog.aggregate([
      { $match: { ...filter, type: 'sale' } },
      { $group: { _id: null, total: { $sum: '$qty' } } }
    ]);

    res.json({
      logs,
      total,
      totalPurchased: totalPurchased[0]?.total || 0,
      totalSold: totalSold[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/upload/product-image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const { url, publicId } = await uploadToCloudinary(
      req.file.buffer,
      'asolgramer',
      [{ width: 800, height: 800, crop: 'fill', quality: 'auto' }]
    );
    res.json({ url, publicId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload/hero-image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const { url, publicId } = await uploadToCloudinary(
      req.file.buffer,
      'asolgramer/hero',
      [{ width: 1600, height: 600, crop: 'fill', gravity: 'auto', quality: 'auto:best', fetch_format: 'auto' }]
    );
    res.json({ url, publicId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload/product-thumbs', authMiddleware, uploadThumb.array('images', 4), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No images uploaded' });
    const results = await Promise.all(
      req.files.map(f =>
        uploadToCloudinary(
          f.buffer,
          'asolgramer/thumbs',
          [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }]
        )
      )
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/upload/:publicId', authMiddleware, async (req, res) => {
  try {
    const publicId = decodeURIComponent(req.params.publicId);
    await cloudinary.uploader.destroy(publicId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find({ active: true }).sort({ order: 1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/categories/all', authMiddleware, async (req, res) => {
  try {
    const cats = await Category.find().sort({ order: 1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', authMiddleware, async (req, res) => {
  try {
    const cat = await Category.create(req.body);
    res.status(201).json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', authMiddleware, async (req, res) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', authMiddleware, async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/categories/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    cat.active = !cat.active;
    await cat.save();
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { items, customer, delivery, subtotal, total, advanceDelivery } = req.body;
    if (!items?.length || !customer?.name || !customer?.phone || !customer?.address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // প্রতিটি item-এর জন্য buyPrice product থেকে নিয়ে আসি
    const enrichedItems = await Promise.all(items.map(async (item) => {
      try {
        if (item.productId) {
          const product = await Product.findById(item.productId).select('variants');
          if (product) {
            const variant = product.variants?.find(v => v.lbl === item.varLabel) || product.variants?.[0];
            if (variant?.bp) {
              return { ...item, buyPrice: variant.bp };
            }
          }
        }
      } catch {}
      return { ...item, buyPrice: item.buyPrice || 0 };
    }));

    // মোট কেনা খরচ ও লাভ গণনা
    const totalBuyCost = enrichedItems.reduce((sum, item) => sum + ((item.buyPrice || 0) * (item.qty || 1)), 0);
    const totalProfit = (subtotal || 0) - totalBuyCost;

    const orderNum = 'ORD-' + Date.now();
    const order = await Order.create({
      orderNum,
      items: enrichedItems,
      customer,
      delivery,
      subtotal,
      total,
      totalBuyCost,
      totalProfit,
      advanceDelivery: advanceDelivery || { paid: false, trxId: '', amount: 0 },
      statusHistory: [{ status: 'pending', note: 'Order placed', time: new Date() }],
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // অর্ডারের পর প্রতিটি পণ্যের স্টক কমাও
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    for (const item of enrichedItems) {
      if (!item.productId) continue;
      try {
        const product = await Product.findById(item.productId);
        if (!product) continue;
        const qty = item.qty || 1;

        // variant-এর stock কমাও
        if (item.varLabel && product.variants?.length) {
          const vIdx = product.variants.findIndex(v => v.lbl === item.varLabel);
          if (vIdx !== -1) {
            const newVarStock = (product.variants[vIdx].stock || 0) - qty;
            product.variants[vIdx].stock = Math.max(0, newVarStock);
          }
        }

        // মোট stockQuantity কমাও
        const newTotal = (product.stockQuantity || 0) - qty;
        product.stockQuantity = Math.max(0, newTotal);

        // স্টক শেষ হলে স্বয়ংক্রিয়ভাবে stockOut = true
        if (product.stockQuantity <= 0) {
          product.stockOut = true;
        }

        product.updatedAt = new Date();
        await product.save();
      } catch (stockErr) {
        console.error(`Stock update failed for ${item.productId}:`, stockErr.message);
      }
    }

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    let filter = status && status !== 'all' ? { status } : {};
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter = {
        ...filter,
        $or: [
          { orderNum: searchRegex },
          { 'customer.name': searchRegex },
          { 'customer.phone': searchRegex }
        ]
      };
    }
    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    res.json({ orders, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status, note, revenueAmount } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.status = status;
    order.statusHistory.push({ status, note, time: new Date() });
    order.updatedAt = new Date();
    // delivered স্ট্যাটাসে revenueAmount পাঠানো হলে order.total আপডেট করুন
    // এটি dashboard revenue গণনায় সঠিক amount দেখাবে
    if (status === 'delivered' && revenueAmount !== undefined && revenueAmount !== null) {
      order.total = Number(revenueAmount);
    }
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hero', async (req, res) => {
  try {
    const slides = await Hero.find({ active: true }).sort({ order: 1 });
    res.json(slides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hero/all', authMiddleware, async (req, res) => {
  try {
    const slides = await Hero.find().sort({ order: 1 });
    res.json(slides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hero', authMiddleware, async (req, res) => {
  try {
    const hero = await Hero.create(req.body);
    res.status(201).json(hero);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/hero/:id', authMiddleware, async (req, res) => {
  try {
    const hero = await Hero.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!hero) return res.status(404).json({ error: 'Hero not found' });
    res.json(hero);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/hero/:id', authMiddleware, async (req, res) => {
  try {
    const hero = await Hero.findByIdAndDelete(req.params.id);
    if (!hero) return res.status(404).json({ error: 'Hero not found' });
    if (hero.imgPublicId) {
      try {
        await cloudinary.uploader.destroy(hero.imgPublicId);
      } catch (err) {
        console.error('Failed to delete hero image:', err.message);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/hero/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const hero = await Hero.findById(req.params.id);
    if (!hero) return res.status(404).json({ error: 'Hero not found' });
    hero.active = !hero.active;
    await hero.save();
    res.json(hero);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const settings = await Settings.find();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', authMiddleware, async (req, res) => {
  try {
    const updates = req.body;
    const operations = Object.entries(updates).map(([key, value]) => ({
      updateOne: {
        filter: { key },
        update: { key, value, updatedAt: new Date() },
        upsert: true
      }
    }));
    await Settings.bulkWrite(operations);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings/:key', authMiddleware, async (req, res) => {
  try {
    const { value } = req.body;
    const setting = await Settings.findOneAndUpdate(
      { key: req.params.key },
      { value, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/settings', async (req, res) => {
  try {
    const settings = await Settings.find();
    const obj = {};
    settings.forEach(s => { if (!["aboutPage","contactPage"].includes(s.key)) obj[s.key] = s.value; });
    res.json(obj);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/pages/about', async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'aboutPage' });
    res.json(setting ? setting.value : {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pages/contact', async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'contactPage' });
    res.json(setting ? setting.value : {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const [totalProducts, totalOrders, pendingOrders, deliveredOrders] = await Promise.all([
      Product.countDocuments({ active: true }),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'delivered' }),
    ]);
    const revenue = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    // মোট কেনা খরচ — delivered অর্ডার থেকে
    const buyCostAgg = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, totalBuyCost: { $sum: '$totalBuyCost' } } },
    ]);
    // লাভ — delivered অর্ডারের totalProfit যোগ
    const profitAgg = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, totalProfit: { $sum: '$totalProfit' } } },
    ]);
    // সব অর্ডারের মোট কেনা খরচ (delivered ছাড়াও)
    const allBuyCostAgg = await Order.aggregate([
      { $match: { status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, totalBuyCost: { $sum: '$totalBuyCost' } } },
    ]);

    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyData = await Order.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo }, status: { $ne: 'cancelled' } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        revenue: { $sum: '$total' },
        buyCost: { $sum: '$totalBuyCost' },
        profit: { $sum: '$totalProfit' },
        count: { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    const catDist = await Product.aggregate([
      { $group: { _id: '$cat', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Analytics — ভিজিটর ও ক্লিক ডেটা
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysStr = sevenDaysAgo.toISOString().slice(0, 10);

    const [totalViewsAgg, todayViewDoc, recentDailyViews, totalClicksAgg, topClicksAgg] = await Promise.all([
      PageView.aggregate([{ $group: { _id: null, total: { $sum: '$count' } } }]),
      PageView.findOne({ date: today }),
      PageView.find({ date: { $gte: sevenDaysStr } }).sort({ date: 1 }).lean(),
      ProductClick.aggregate([{ $group: { _id: null, total: { $sum: '$count' } } }]),
      ProductClick.aggregate([
        { $match: { date: { $gte: sevenDaysStr } } },
        { $group: { _id: '$productId', clicks: { $sum: '$count' } } },
        { $sort: { clicks: -1 } },
        { $limit: 5 }
      ]),
    ]);

    const topClickProductIds = topClicksAgg.map(c => c._id);
    const topClickProducts = await Product.find({ _id: { $in: topClickProductIds } }).select('nm em img').lean();
    const prodMap = {};
    topClickProducts.forEach(p => { prodMap[p._id.toString()] = p; });
    const topProductClicks = topClicksAgg.map(c => ({
      productId: c._id,
      clicks: c.clicks,
      nm: prodMap[c._id]?.nm || 'অজানা',
      em: prodMap[c._id]?.em || '🛒',
      img: prodMap[c._id]?.img || '',
    }));

    res.json({
      totalProducts,
      totalOrders,
      pendingOrders,
      deliveredOrders,
      totalRevenue: revenue[0]?.total || 0,
      totalBuyCost: buyCostAgg[0]?.totalBuyCost || 0,
      totalProfit: profitAgg[0]?.totalProfit || 0,
      allOrdersBuyCost: allBuyCostAgg[0]?.totalBuyCost || 0,
      recentOrders,
      monthlyData,
      catDist,
      // Analytics ডেটা
      totalVisitors: totalViewsAgg[0]?.total || 0,
      todayVisitors: todayViewDoc?.count || 0,
      totalProductClicks: totalClicksAgg[0]?.total || 0,
      recentDailyViews,
      topProductClicks,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/seed', authMiddleware, async (req, res) => {
  try {
    const { force } = req.body;
    const catCount = await Category.countDocuments();
    if (catCount === 0 || force) {
      if (force) await Category.deleteMany({});
      await Category.insertMany([
        { id: 'misty', lbl: 'মিষ্টি', em: '🍯', order: 1, active: true },
        { id: 'doi', lbl: 'দই', em: '🥛', order: 2, active: true },
        { id: 'mithai', lbl: 'মিঠাই', em: '🍬', order: 3, active: true },
        { id: 'tail', lbl: 'তৈল', em: '🌿', order: 4, active: true },
        { id: 'borhani', lbl: 'বোরহানী', em: '🥤', order: 5, active: true },
        { id: 'rosmalai', lbl: 'রশমালাই', em: '🍚', order: 6, active: true },
      ]);
    }
    const prodCount = await Product.countDocuments();
    if (prodCount === 0 || force) {
      if (force) await Product.deleteMany({});
      await Product.insertMany([
        { cat: 'misty', nm: 'সরিষার ফুলের মধু', sub: '१००% খাঁটি এবং আসল মধু', em: '🍯', bg: '#c8a55a', best: true, active: true, phone: '01712345678', desc: 'সরিষার ফুল থেকে সংগৃহীত খাঁটি মধু।', variants: [{ lbl: '०००gm', p: 280, op: 350, disc: '२०%' }, { lbl: '१kg', p: 520, op: 680, disc: '२४%' }], order: 1 },
        { cat: 'misty', nm: 'খেজুরের মধু', sub: 'মিশ্র ফুলের সংমিশ্রণ', em: '🍯', bg: '#8b6914', best: false, active: true, phone: '01712345678', desc: 'খেজুর গাছের ফুল থেকে সংগৃহীত।', variants: [{ lbl: '००००gm', p: 320, op: 400, disc: '२०%' }], order: 2 },
        { cat: 'misty', nm: 'ফুলের মধু মিশ্রণ', sub: 'বহু ফুলের নির্যাস', em: '🌸', bg: '#d4a574', best: false, active: true, phone: '01712345678', variants: [{ lbl: '३००gm', p: 180, op: 250, disc: '२८%' }], order: 3 },
        { cat: 'misty', nm: 'আম্বাজি মধু', sub: 'স্বর্গীয় स्वाद का मधु', em: '🥭', bg: '#e8b84e', best: false, active: true, phone: '01712345678', variants: [{ lbl: '०२५०gm', p: 200, op: 280, disc: '२८%' }], order: 4 },
        { cat: 'misty', nm: 'স্থানীয় বন মধু', sub: 'প্রাকৃতিক অরণ্য from', em: '🌲', bg: '#997744', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 350, op: 500, disc: '३०%' }], order: 5 },
        { cat: 'doi', nm: 'গ্রামীণ গরুর দই', sub: 'ঘরে তৈরি খাঁটি দই', em: '🥛', bg: '#f5f5dc', best: true, active: true, phone: '01712345678', variants: [{ lbl: '१ keji', p: 120, op: 150, disc: '२०%' }], order: 1 },
        { cat: 'doi', nm: 'মিষ্টি মেহেরী দই', sub: 'প্রিমিয়াম মানের দই', em: '🍶', bg: '#fffacd', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 70, op: 90, disc: '२२%' }], order: 2 },
        { cat: 'doi', nm: 'ছাগলের দই', sub: 'স্বাস্থ্যকর বিকল্প', em: '🐐', bg: '#e6d5c8', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 100, op: 140, disc: '२९%' }], order: 3 },
        { cat: 'doi', nm: 'কুমড়ার দই', sub: 'বিশেষ স্বাদের দই', em: '🎃', bg: '#ffa500', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 90, op: 120, disc: '२५%' }], order: 4 },
        { cat: 'doi', nm: 'স্ট্রবেরি দই', sub: 'ফলের সুস্বাদু দই', em: '🍓', bg: '#ffb6c1', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 95, op: 130, disc: '२७%' }], order: 5 },
        { cat: 'mithai', nm: 'সন্দেশ', sub: 'ঐতিহ্য মিঠাই', em: '🍪', bg: '#d4a574', best: true, active: true, phone: '01712345678', variants: [{ lbl: '५टि पिस', p: 150, op: 200, disc: '२५%' }], order: 1 },
        { cat: 'mithai', nm: 'রসগোল্লা', sub: 'সুস্বাদু সাদা মিঠাই', em: '⚪', bg: '#fffacd', best: false, active: true, phone: '01712345678', variants: [{ lbl: '०५टि पिस', p: 120, op: 160, disc: '२५%' }], order: 2 },
        { cat: 'mithai', nm: 'পায়েস', sub: 'ঐতিহ্যবাহী খীরের পায়েস', em: '🥣', bg: '#ffd700', best: false, active: true, phone: '01712345678', variants: [{ lbl: '२००gm', p: 100, op: 140, disc: '२९%' }], order: 3 },
        { cat: 'mithai', nm: 'গুলাব জামুন', sub: 'মিঠাই ভাজার মিঠাই', em: '🔴', bg: '#8b4513', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 130, op: 180, disc: '२८%' }], order: 4 },
        { cat: 'mithai', nm: 'খীর কামান', sub: 'বিশেষ খীরের মিঠাই', em: '🎀', bg: '#daa520', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 90, op: 130, disc: '३१%' }], order: 5 },
        { cat: 'tail', nm: 'নারকেল তেল', sub: 'পূর্ণ খাঁটি তেল', em: '🥥', bg: '#8b6914', best: true, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 250, op: 350, disc: '२९%' }], order: 1 },
        { cat: 'tail', nm: 'তিসি তেল', sub: 'স্বাস্থ্য তেল', em: '🌿', bg: '#6b4423', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 180, op: 260, disc: '३१%' }], order: 2 },
        { cat: 'tail', nm: 'সরিষার তেল', sub: 'রসোই তেল', em: '🌾', bg: '#997744', best: false, active: true, phone: '01712345678', variants: [{ lbl: '१ लiter', p: 320, op: 480, disc: '३३%' }], order: 3 },
        { cat: 'tail', nm: 'জলপাই তেল', sub: 'স্বাস্থ্য বিকল্প', em: '🫒', bg: '#556b2f', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 320, op: 480, disc: '३३%' }], order: 4 },
        { cat: 'tail', nm: 'সুগন্ধি তেল', sub: 'আয়ুর্বেদিক মিশ্রণ', em: '🌸', bg: '#d4a574', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 120, op: 180, disc: '३३%' }], order: 5 },
        { cat: 'borhani', nm: 'ঘিয়ে বোরহানী', sub: 'ঐতিহ্যবাহী পানীয়', em: '🥤', bg: '#f5f5dc', best: true, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 80, op: 120, disc: '३३%' }], order: 1 },
        { cat: 'borhani', nm: 'পুদিনা বোরহানী', sub: 'তাজা পুদিনা', em: '🌿', bg: '#e6f5e6', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 60, op: 100, disc: '४०%' }], order: 2 },
        { cat: 'borhani', nm: 'জিরা বোরহানী', sub: 'পাচন শক্তি', em: '🌾', bg: '#f5deb3', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 70, op: 110, disc: '३६%' }], order: 3 },
        { cat: 'borhani', nm: 'আম্রপালী বোরহানী', sub: 'ফলের স্বাদ', em: '🥭', bg: '#ffd700', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 90, op: 130, disc: '३१%' }], order: 4 },
        { cat: 'borhani', nm: 'মাল্টি মশলা বোরহানী', sub: 'মশলার মিশ্রণ', em: '🌶️', bg: '#ff6347', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 75, op: 120, disc: '३८%' }], order: 5 },
        { cat: 'rosmalai', nm: 'খাঁটি রশমালাই', sub: 'ছানার মিঠাই', em: '🍚', bg: '#f5f5dc', best: true, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 200, op: 280, disc: '२९%' }], order: 1 },
        { cat: 'rosmalai', nm: 'পিস্তা রশমালাই', sub: 'শুকনো ফল', em: '🌰', bg: '#f5deb3', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 280, op: 400, disc: '३०%' }], order: 2 },
        { cat: 'rosmalai', nm: 'গোলাপি রশমালাই', sub: 'গোলাপ জল', em: '🌹', bg: '#ffb6c1', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 220, op: 320, disc: '३१%' }], order: 3 },
        { cat: 'rosmalai', nm: 'আখরোট রশমালাই', sub: 'আখরোট শক্তি', em: '🧠', bg: '#daa520', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 240, op: 350, disc: '३१%' }], order: 4 },
        { cat: 'rosmalai', nm: 'সাদা রশমালাই', sub: 'ঐতিহ্য মিঠাই', em: '⚪', bg: '#fffacd', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 180, op: 250, disc: '२८%' }], order: 5 }
      ]);
    }
    const heroCount = await Hero.countDocuments();
    if (heroCount === 0 || force) {
      if (force) await Hero.deleteMany({});
      await Hero.insertMany([
        { title: 'গ্রামীণ সতেজতা ও স্বাদ', subtitle: 'বিশুদ্ধ গ্রামীণ পণ্য', gradient: 's1', order: 1 },
        { title: 'বিশুদ্ধ সরিষার মধু', subtitle: 'প্রাকৃতিক মৌমাছি', gradient: 's2', order: 2 },
        { title: 'তাজা দুধ তৈরী দই', subtitle: 'খাঁটি গ্রামীণ স্বাদ', gradient: 's3', order: 3 },
      ]);
    }
    res.json({ success: true, message: 'Seed completed - 6 categories with 30 products' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ওয়েবসাইট খরচ ট্র্যাকার Routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// সব খরচ দেখো (admin only)
app.get('/api/website-costs', authMiddleware, async (req, res) => {
  try {
    const costs = await WebsiteCost.find().sort({ date: -1 });
    const totalAmount = costs.reduce((s, c) => s + c.amount, 0);
    const totalPaid = costs.reduce((s, c) => {
      if (c.status === 'paid') return s + c.amount;
      if (c.status === 'partial') return s + (c.paidAmount || 0);
      return s;
    }, 0);
    const totalPending = costs.reduce((s, c) => {
      if (c.status === 'pending') return s + c.amount;
      if (c.status === 'partial') return s + (c.amount - (c.paidAmount || 0));
      return s;
    }, 0);
    res.json({ costs, totalAmount, totalPaid, totalPending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// নতুন খরচ যোগ করো (admin only)
app.post('/api/website-costs', authMiddleware, async (req, res) => {
  try {
    const cost = await WebsiteCost.create({ ...req.body, updatedAt: new Date() });
    res.status(201).json(cost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// খরচ আপডেট করো (admin only)
app.put('/api/website-costs/:id', authMiddleware, async (req, res) => {
  try {
    const cost = await WebsiteCost.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!cost) return res.status(404).json({ error: 'Record not found' });
    res.json(cost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// খরচ মুছো (admin only)
app.delete('/api/website-costs/:id', authMiddleware, async (req, res) => {
  try {
    const cost = await WebsiteCost.findByIdAndDelete(req.params.id);
    if (!cost) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics Routes — ভিজিটর ও প্রোডাক্ট ক্লিক
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ফ্রন্টএন্ড পেজ ভিজিট রেকর্ড করো (public)
app.post('/api/analytics/pageview', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await PageView.findOneAndUpdate(
      { date: today },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// প্রোডাক্ট ক্লিক রেকর্ড করো (public)
app.post('/api/analytics/product-click/:id', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await ProductClick.findOneAndUpdate(
      { productId: req.params.id, date: today },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics সারাংশ (admin only)
app.get('/api/analytics/summary', authMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    // মোট ভিজিটর (সব সময়)
    const totalViewsAgg = await PageView.aggregate([
      { $group: { _id: null, total: { $sum: '$count' } } }
    ]);
    const totalViews = totalViewsAgg[0]?.total || 0;

    // শেষ N দিনের দৈনিক ভিজিট
    const dailyViews = await PageView.find({ date: { $gte: sinceStr } })
      .sort({ date: 1 }).lean();

    // শেষ N দিনে মোট ভিজিট
    const recentViewsTotal = dailyViews.reduce((s, d) => s + d.count, 0);

    // আজকের ভিজিট
    const today = new Date().toISOString().slice(0, 10);
    const todayView = await PageView.findOne({ date: today });
    const todayViews = todayView?.count || 0;

    // সবচেয়ে বেশি ক্লিক হওয়া পণ্য (শেষ N দিন)
    const topClicksAgg = await ProductClick.aggregate([
      { $match: { date: { $gte: sinceStr } } },
      { $group: { _id: '$productId', clicks: { $sum: '$count' } } },
      { $sort: { clicks: -1 } },
      { $limit: 10 }
    ]);

    // পণ্যের নাম যোগ করো
    const productIds = topClicksAgg.map(c => c._id);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('nm em img cat').lean();
    const prodMap = {};
    products.forEach(p => { prodMap[p._id.toString()] = p; });

    const topProducts = topClicksAgg.map(c => ({
      productId: c._id,
      clicks: c.clicks,
      nm: prodMap[c._id]?.nm || 'অজানা পণ্য',
      em: prodMap[c._id]?.em || '🛒',
      img: prodMap[c._id]?.img || '',
      cat: prodMap[c._id]?.cat || '',
    }));

    // মোট প্রোডাক্ট ক্লিক (সব সময়)
    const totalClicksAgg = await ProductClick.aggregate([
      { $group: { _id: null, total: { $sum: '$count' } } }
    ]);
    const totalClicks = totalClicksAgg[0]?.total || 0;

    res.json({
      totalViews,
      recentViewsTotal,
      todayViews,
      dailyViews,
      topProducts,
      totalClicks,
      days,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const products = await Product.find({ active: true }).select('slug updatedAt');
    const baseUrl = process.env.FRONTEND_URL || 'https://asolgramermoja.netlify.app';
    let urls = '';
    products.forEach(p => {
      if (p.slug) {
        urls += `
  <url>
    <loc>${baseUrl}/#/product/${p.slug}</loc>
    <lastmod>${p.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
      }
    });
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/#/products</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>${urls}
</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Sitemap: ${process.env.FRONTEND_URL || 'https://asolgramermoja.netlify.app'}/sitemap.xml
`);
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;