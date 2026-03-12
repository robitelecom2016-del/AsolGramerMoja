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

// ═══ CLOUDINARY CONFIG ═══
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ═══ CORS CONFIG ═══
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
      callback(null, true); // Allow all for now
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ═══ MONGODB CONNECTION ═══
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

// ═══ SCHEMAS ═══

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, default: 'Admin' },
  createdAt: { type: Date, default: Date.now },
});
const Admin = mongoose.model('Admin', adminSchema);

// Category Schema
const categorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  lbl: { type: String, required: true },
  em: { type: String, default: '🛒' },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});
const Category = mongoose.model('Category', categorySchema);

// Product Schema
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
    op: Number,
    disc: String,
  }],
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Product = mongoose.model('Product', productSchema);

// Order Schema
const orderSchema = new mongoose.Schema({
  orderNum: { type: String, required: true, unique: true },
  items: [{
    productId: String,
    nm: String,
    varLabel: String,
    qty: Number,
    cartPrice: Number,
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
  subtotal: Number,
  total: Number,
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

// Hero Slide Schema
const heroSchema = new mongoose.Schema({
  title: String,
  subtitle: String,
  gradient: { type: String, default: 's1' },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});
const Hero = mongoose.model('Hero', heroSchema);

// Settings Schema
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now },
});
const Settings = mongoose.model('Settings', settingSchema);

// ═══ MIDDLEWARE ═══
const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.adminId = decoded.id;
    next();
  } catch(err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── AUTH ───
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    const existing = await Admin.findOne({ username });
    if (existing) return res.status(400).json({ error: 'User exists' });
    const hashed = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ username, password: hashed, name });
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
    res.json({ token, name: admin.name });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(400).json({ error: 'User not found' });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(400).json({ error: 'Invalid password' });
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
    res.json({ token, name: admin.name });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CATEGORIES ───
app.get('/api/categories/all', async (req, res) => {
  try {
    const categories = await Category.find().sort({ order: 1 });
    res.json(categories);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', authMiddleware, async (req, res) => {
  try {
    const cat = await Category.create(req.body);
    res.json(cat);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', authMiddleware, async (req, res) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(cat);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', authMiddleware, async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PRODUCTS ───
app.get('/api/products', async (req, res) => {
  try {
    const { cat, best, active = 'true', limit, page = 1, search } = req.query;
    const filter = {};
    
    if (active !== 'all') filter.active = active === 'true';
    if (cat && cat !== 'all') filter.cat = cat;
    if (best === 'true') filter.best = true;
    
    // ✅ সার্চ ফাংশনালিটি যোগ করা হয়েছে
    if (search) {
      const searchRegex = new RegExp(search, 'i'); // কেস-ইন্সেনসিটিভ সার্চ
      filter.$or = [
        { nm: searchRegex },      // পণ্যের নাম
        { sub: searchRegex },     // সাব-টাইটেল
        { desc: searchRegex }     // বর্ণনা
      ];
    }

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
    const prod = await Product.create(req.body);
    res.json(prod);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    const prod = await Product.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: new Date() }, { new: true });
    res.json(prod);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    const prod = await Product.findById(req.params.id);
    if (prod?.imgPublicId) {
      await cloudinary.uploader.destroy(prod.imgPublicId).catch(() => {});
    }
    if (prod?.imgsPublicIds?.length) {
      for (const pid of prod.imgsPublicIds) {
        await cloudinary.uploader.destroy(pid).catch(() => {});
      }
    }
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ORDERS ───
app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { status, search, limit = 10, page = 1 } = req.query;
    const filter = {};
    
    if (status && status !== 'all') filter.status = status;
    
    // সার্চ: অর্ডার নং, গ্রাহক নাম বা ফোন
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { orderNum: searchRegex },
        { 'customer.name': searchRegex },
        { 'customer.phone': searchRegex }
      ];
    }

    const total = await Order.countDocuments(filter);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({ orders, total, page: parseInt(page) });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const orderNum = 'ORD-' + Date.now();
    const order = await Order.create({
      ...req.body,
      orderNum,
      statusHistory: [{ status: 'pending', note: 'Order created' }]
    });
    res.json(order);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (status && status !== order.status) {
      order.statusHistory.push({ status, note: note || '' });
      order.status = status;
    }
    
    order.updatedAt = new Date();
    await order.save();
    res.json(order);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── UPLOAD ───
const storage = require('multer-storage-cloudinary')({
  cloudinary,
  folder: 'asolgramer',
  allowed_formats: ['jpg','jpeg','png','gif','webp'],
  transformation: [{ width: 500, height: 500, crop: 'limit', quality: 'auto' }]
});

const upload = multer({ storage });

app.post('/api/upload/product-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({
    url: req.file.secure_url,
    publicId: req.file.public_id
  });
});

app.post('/api/upload/product-thumbs', upload.array('images', 4), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });
  res.json(req.files.map(f => ({
    url: f.secure_url,
    publicId: f.public_id
  })));
});

// ─── HERO SLIDES ───
app.get('/api/hero', async (req, res) => {
  try {
    const slides = await Hero.find().sort({ order: 1 });
    res.json(slides);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hero', authMiddleware, async (req, res) => {
  try {
    const slide = await Hero.create(req.body);
    res.json(slide);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/hero/:id', authMiddleware, async (req, res) => {
  try {
    const slide = await Hero.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(slide);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/hero/:id', authMiddleware, async (req, res) => {
  try {
    await Hero.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SETTINGS ───
app.put('/api/settings', authMiddleware, async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await Settings.findOneAndUpdate(
        { key },
        { value, updatedAt: new Date() },
        { upsert: true, new: true }
      );
    }
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings/:key', authMiddleware, async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: req.params.key });
    res.json(setting || { key: req.params.key, value: null });
  } catch(err) {
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

// ─── DASHBOARD STATS ───
app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const [totalProducts, totalOrders, pendingOrders, deliveredOrders] = await Promise.all([
      Product.countDocuments({ active: true }),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'delivered' }),
    ]);

    const revenue = await Order.aggregate([
      { $match: { status: { $in: ['delivered', 'shipped'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyData = await Order.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo }, status: { $ne: 'cancelled' } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        revenue: { $sum: '$total' },
        count: { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const catDist = await Product.aggregate([
      { $group: { _id: '$cat', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.json({
      totalProducts,
      totalOrders,
      pendingOrders,
      deliveredOrders,
      totalRevenue: revenue[0]?.total || 0,
      recentOrders,
      monthlyData,
      catDist,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SEED INITIAL DATA ───
app.post('/api/seed', authMiddleware, async (req, res) => {
  try {
    const { force } = req.body;
    
    // Seed categories
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

    // Seed products
    const prodCount = await Product.countDocuments();
    if (prodCount === 0 || force) {
      if (force) await Product.deleteMany({});
      await Product.insertMany([
        // MISTY (মিষ্টি) - 5
        { cat: 'misty', nm: 'সরিষার ফুলের মধু', sub: '१००% খাঁটি এবং আসল মধু', em: '🍯', bg: '#c8a55a', best: true, active: true, phone: '01712345678', desc: 'সরিষার ফুল থেকে সংগৃহীত খাঁটি মধু।', variants: [{ lbl: '०००gm', p: 280, op: 350, disc: '२०%' }, { lbl: '१kg', p: 520, op: 680, disc: '२४%' }], order: 1 },
        { cat: 'misty', nm: 'খেজুরের মধু', sub: 'মিশ্র ফুলের সংমিশ্রণ', em: '🍯', bg: '#8b6914', best: false, active: true, phone: '01712345678', desc: 'খেজুর গাছের ফুল থেকে সংগৃহীত।', variants: [{ lbl: '००००gm', p: 320, op: 400, disc: '२०%' }], order: 2 },
        { cat: 'misty', nm: 'ফুলের মধু মিশ্রণ', sub: 'বহু ফুলের নির্যাস', em: '🌸', bg: '#d4a574', best: false, active: true, phone: '01712345678', variants: [{ lbl: '३००gm', p: 180, op: 250, disc: '२८%' }], order: 3 },
        { cat: 'misty', nm: 'আম্বাজি মধু', sub: 'স্বর्गीय স्वाद का मधु', em: '🥭', bg: '#e8b84e', best: false, active: true, phone: '01712345678', variants: [{ lbl: '०२५०gm', p: 200, op: 280, disc: '२८%' }], order: 4 },
        { cat: 'misty', nm: 'স্থানীয় বন মধু', sub: 'प्राकৃतिक अरण्य from', em: '🌲', bg: '#997744', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 350, op: 500, disc: '३०%' }], order: 5 },

        // DOI (दोi) - 5
        { cat: 'doi', nm: 'গ্রামীণ গরুর দই', sub: 'घरे تৈরि খাঁति दोi', em: '🥛', bg: '#f5f5dc', best: true, active: true, phone: '01712345678', variants: [{ lbl: '१ keji', p: 120, op: 150, disc: '२०%' }], order: 1 },
        { cat: 'doi', nm: 'মিষ্টি মেহেরী দই', sub: 'प्रीमिय्म मानের দোi', em: '🍶', bg: '#fffacd', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 70, op: 90, disc: '२२%' }], order: 2 },
        { cat: 'doi', nm: 'ছাগলের দই', sub: 'स्वास्थ्यकर विकल्प', em: '🐐', bg: '#e6d5c8', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 100, op: 140, disc: '२९%' }], order: 3 },
        { cat: 'doi', nm: 'কুমড়ার দই', sub: 'विशेष स्वाद का दोi', em: '🎃', bg: '#ffa500', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 90, op: 120, disc: '२५%' }], order: 4 },
        { cat: 'doi', nm: 'স্ট্রবেরি দই', sub: 'फलের सुस्वादु दोi', em: '🍓', bg: '#ffb6c1', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 95, op: 130, disc: '२७%' }], order: 5 },

        // MITHAI (मितार्य) - 5
        { cat: 'mithai', nm: 'সন্দেশ', sub: 'ऐतिहास मिषाई', em: '🍪', bg: '#d4a574', best: true, active: true, phone: '01712345678', variants: [{ lbl: '५टि पिस', p: 150, op: 200, disc: '२५%' }], order: 1 },
        { cat: 'mithai', nm: 'রসগোল্লা', sub: 'सुस्वादु सादा मिषाई', em: '⚪', bg: '#fffacd', best: false, active: true, phone: '01712345678', variants: [{ lbl: '०५टि पिस', p: 120, op: 160, disc: '२५%' }], order: 2 },
        { cat: 'mithai', nm: 'পায়েস', sub: 'ঐতिह્યbahi खीर का पायेश्', em: '🥣', bg: '#ffd700', best: false, active: true, phone: '01712345678', variants: [{ lbl: '२००gm', p: 100, op: 140, disc: '२९%' }], order: 3 },
        { cat: 'mithai', nm: 'গুলাব জামুন', sub: 'मिषाई ভাজার মिषাई', em: '🔴', bg: '#8b4513', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 130, op: 180, disc: '२८%' }], order: 4 },
        { cat: 'mithai', nm: 'খীর কামান', sub: 'बिशेष खीर का मिषाई', em: '🎀', bg: '#daa520', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००gm', p: 90, op: 130, disc: '३१%' }], order: 5 },

        // TAIL (तैल) - 5
        { cat: 'tail', nm: 'নারকেল তেল', sub: 'पूरी खाँटि तेल', em: '🥥', bg: '#8b6914', best: true, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 250, op: 350, disc: '२९%' }], order: 1 },
        { cat: 'tail', nm: 'তিসি তেল', sub: 'स्वास्थ्य तेल', em: '🌿', bg: '#6b4423', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 180, op: 260, disc: '३१%' }], order: 2 },
        { cat: 'tail', nm: 'সরিষার তেল', sub: 'रसोई का तेल', em: '🌾', bg: '#997744', best: false, active: true, phone: '01712345678', variants: [{ lbl: '१ लiter', p: 320, op: 480, disc: '३३%' }], order: 3 },
        { cat: 'tail', nm: 'জলপাই তেল', sub: 'स्वास्थ्य विकल्प', em: '🫒', bg: '#556b2f', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 320, op: 480, disc: '३३%' }], order: 4 },
        { cat: 'tail', nm: 'সুগন্ধি তেল', sub: 'आयुर्वेदिक मिश्रण', em: '🌸', bg: '#d4a574', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 120, op: 180, disc: '३३%' }], order: 5 },

        // BORHANI (बोरहानि) - 5
        { cat: 'borhani', nm: 'ঘিয়ে বোরহানী', sub: 'ঐতिह्यbahi pिणनiय', em: '🥤', bg: '#f5f5dc', best: true, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 80, op: 120, disc: '३३%' }], order: 1 },
        { cat: 'borhani', nm: 'পুদিনা বোরহানী', sub: 'तাजा पुदिना', em: '🌿', bg: '#e6f5e6', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 60, op: 100, disc: '४०%' }], order: 2 },
        { cat: 'borhani', nm: 'জিরা বোরহানী', sub: 'पाचन शक्ti', em: '🌾', bg: '#f5deb3', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 70, op: 110, disc: '३६%' }], order: 3 },
        { cat: 'borhani', nm: 'আম্রপালী বোরহানী', sub: 'फल का स्वाद', em: '🥭', bg: '#ffd700', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 90, op: 130, disc: '३१%' }], order: 4 },
        { cat: 'borhani', nm: 'মাল্টি মশলা বোরহানী', sub: 'मसाले का मिश्रण', em: '🌶️', bg: '#ff6347', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००००ml', p: 75, op: 120, disc: '३८%' }], order: 5 },

        // ROSMALAI (रॉस्मलAই) - 5
        { cat: 'rosmalai', nm: 'খাঁটি রশমালাই', sub: 'छनार मिषाई', em: '🍚', bg: '#f5f5dc', best: true, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 200, op: 280, disc: '२९%' }], order: 1 },
        { cat: 'rosmalai', nm: 'পিস्তা रशमालai', sub: 'शुकno फल', em: '🌰', bg: '#f5deb3', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 280, op: 400, disc: '३०%' }], order: 2 },
        { cat: 'rosmalai', nm: 'গোলাপি রশমালাই', sub: 'गुलाब जल', em: '🌹', bg: '#ffb6c1', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 220, op: 320, disc: '३१%' }], order: 3 },
        { cat: 'rosmalai', nm: 'আখরোট রশমালাই', sub: 'अखरोट शक्ti', em: '🧠', bg: '#daa520', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 240, op: 350, disc: '३१%' }], order: 4 },
        { cat: 'rosmalai', nm: 'সাদা রশমালাই', sub: 'ঐতिह्य मिषाई', em: '⚪', bg: '#fffacd', best: false, active: true, phone: '01712345678', variants: [{ lbl: '००५टि पिस', p: 180, op: 250, disc: '२८%' }], order: 5 }
      ]);
    }

    // Seed hero
    const heroCount = await Hero.countDocuments();
    if (heroCount === 0 || force) {
      if (force) await Hero.deleteMany({});
      await Hero.insertMany([
        { title: 'গ্রামীণ সতেজতা ও स्वाद', subtitle: 'বিশুद्ध গ্রামীণ পণ्य', gradient: 's1', order: 1 },
        { title: 'बिशुद्ध सरिषार मधु', subtitle: 'प्राकৃतिক মৌমাছি', gradient: 's2', order: 2 },
        { title: 'ताजा दुध तৈरि दोi', subtitle: 'খাঁটি গ্রামীণ स्वाद', gradient: 's3', order: 3 },
      ]);
    }

    res.json({ success: true, message: 'Seed completed - 6 categories with 30 products' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 404 ───
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── ERROR HANDLER ───
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START ───
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;