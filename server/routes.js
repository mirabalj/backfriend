import auth from 'basic-auth';
import jwt from 'koa-jwt';
import sha1 from 'sha1';
import User from './models/user';
import Post from './models/post';
import { baseApi, secretKey } from './config';

// Export a function that takes the router
export default router => {
  // Set a prefix of our api, in this case api
  router.prefix('/' + baseApi);

  // POST Sign Up (register).
  router.post('/signup', async (ctx, next) => {
    var user = ctx.request.body;
    user.password = sha1(user.password);
    ctx.body = await new User(user).save();
  });

  // GET Sign In (login).
  router.get('/signin', async(ctx) => {
    var token = null;
    // Basic Auth
    const credentials = auth(ctx);
    // On credentials, find the user in database
    if (credentials) {
      const user = await User.findOne({ 'username': credentials.name, 'password': credentials.pass });
      if (user) {
        var profile = {
          name: user.name,
          username: user.username,
          id: user._id,
        };
        // We are sending the profile inside the token
        token = jwt.sign(profile, secretKey);
      }
    }
    // Check login
    if (!token) {
      ctx.status = 401
      ctx.response.set('WWW-Authenticate', 'Basic realm="backfriend"')
      ctx.body = { error: true, message: 'Access denied' };
    } else {
      ctx.body = { success: true, message: 'Access granted', token: token };
    }
  });

  // GET All users
  router.get('/user', async(ctx) =>
    ctx.body = await User.find());
    // Or user paginate middleware
    // ctx.body = ctx.request.paginate.docs);

  // POST Follow user
  router.post('/user/:id/follow', async(ctx) => {
    // Get token
    var token = ctx.headers.authorization.replace('Bearer ','');
    // Decode user
    var me = jwt.decode(token);
    const follow = await User.findById(ctx.params.id);
    if (follow) {
      const user = await User.findById(me.id);
      if (user) {
        // Check follow
        var pos = user.follows.indexOf(follow._id);
        if (pos < 0) {
          user.follows.push(follow._id);
          // Check friendship
          var pos = follow.follows.indexOf(user._id);
          if (pos >= 0) {
            user.friends.push(follow._id);
            follow.friends.push(user._id);
            // Save Follow
            follow.save();
          }
          // Save User
          user.save();
        }
        // Response user_id, follow_id, and follows length
        ctx.body = { id: user._id, follow: follow._id, followings: user.follows.length };
      } else {
        ctx.status = 404;
        ctx.body = { error: true, message: 'User not found' };
      }
    } else {
      ctx.status = 404;
      ctx.body = { error: true, message: 'Follower not found' };
    }
  });

  // GET Follows of user
  router.get('/user/:id/follow', async(ctx) => {
    const user = await User.findById(ctx.params.id);
    if (user) {
      ctx.body = await User.find({ _id: { $in: user.follows } }, { __v: false, password: false });
    } else {
      ctx.status = 404;
      ctx.body = { error: true, message: 'User not found' };
    }
  });

  // GET Friends of user
  router.get('/user/:id/friend', async(ctx) => {
    const user = await User.findById(ctx.params.id);
    if (user) {
      ctx.body = await User.find({ _id: { $in: user.friends } }, { __v: false, password: false });
    } else {
      ctx.status = 404;
      ctx.body = { error: true, message: 'User not found' };
    }
  });

  // GET All Posts
  router.get('/post', async(ctx) =>
    ctx.body = await Post.aggregate({
      $project: {
        _id: 1,
        body: 1,
        author: 1,
        date: 1,
        comments: {
          $size:'$comments'
        }
      }
    }));

  // POST One Post
  router.post('/post', async(ctx) => {
    var token = ctx.headers.authorization.replace('Bearer ','');
    var me = jwt.decode(token); // Decode user
    var post = ctx.request.body;
    // Has image file?
    var name = '';
    if (post.hasOwnProperty('files')) {
      if (post.files.hasOwnProperty('image')) {
        name = post.files.image.path.replace(__dirname + '/uploads/','');
      }
    }
    // Is a multipart/form-data?
    if (post.hasOwnProperty('fields')) {
      post = post.fields;
    }
    // Complete information
    post.author = { id: me.id, username: me.username };
    post.image = name;
    post.date = new Date();
    ctx.body = await new Post(post).save();
  });

  // POST Comment
  router.post('/post/:id/comment', async(ctx) => {
    var token = ctx.headers.authorization.replace('Bearer ','');
    var me = jwt.decode(token);
    const post = await Post.findById(ctx.params.id);
    if (post) {
      // Check friendship
      var pos = null;
      const user = await User.findById(me.id);
      if (post.author.id.equals(user._id)) {
        // Owner of Post
        pos = 0;
      } else {
        pos = user.friends.indexOf(post.author.id);
      }
      if (pos >= 0) {
        // Add info to comment
        var comment = ctx.request.body;
        comment.author = { id: me.id, username: me.username };
        comment.date = new Date();
        post.comments.push(comment);
        // Save comment and response
        post.save();
        ctx.body = comment;
      } else {
        ctx.status = 401;
        ctx.body = { error: true, message: 'Friendship not found' }; // Funny ;)
      }
    } else {
      ctx.status = 404;
      ctx.body = { error: true, message: 'Post not found' };
    }
  });

  // GET Comments of any Post
  router.get('/post/:id/comment', async(ctx) => {
    var token = ctx.headers.authorization.replace('Bearer ','');
    var me = jwt.decode(token);
    const post = await Post.findById(ctx.params.id);
    if (post) {
      const user = await User.findById(me.id);
      // Filter, only friends
      const comments = post.comments;
      var friends = user.friends;
      // Bit to show comments of owner of post
      friends.push(user._id)
      // Response filter comments
      ctx.body = await comments.filter(function(comment) {
        return friends.indexOf(comment.author.id) >= 0;
      });
    } else {
      ctx.status = 404;
      ctx.body = { error: true, message: 'Post not found' };
    }
  });

  return router;
}
