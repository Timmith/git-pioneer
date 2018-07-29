var three = require('three');
var CheckerboardTexture = require('threejs-texture-checkerboard');
var cannon = require('cannon');
var urlParam = require('urlparam');
var clamp = require('clamp');
var Signal = require('signals').Signal;
var Player = require('./Player');

var tools = require('gameObjects/tools');
var effects = require('gameObjects/effects');
var Portal = require('gameObjects/Portal');

var geomLib = require('geometry/lib');
var CollisionLayers = require('CollisionLayers');

function WorldManager(canvas, scene, camera, inputManager) {
	var pointers = inputManager.pointers;

	var planeMaterial = new three.MeshPhongMaterial({
		map: new CheckerboardTexture(0x6f4f3f, 0x7f5f4f, 1000, 1000)
	});
	var plane = new three.Mesh(
		new three.PlaneGeometry(1000, 1000, 1, 1),
		planeMaterial
	);

	scene.add(plane);

	var world = new cannon.World();
	world.gravity.set(0, 0, -16);
	world.gravity.w = 0.4;
	world.broadphase = new cannon.NaiveBroadphase();
	world.solver.iterations = 10;

	var objects = [];

	var ambient = new three.HemisphereLight(0x7fafcf, 0x6f4f3f, 1); 
	ambient.position.set(0, 0, 100);
	scene.add(ambient);

	var groundBody = new cannon.Body({
			mass: 0, // mass == 0 makes the body static
			collisionFilterGroup: CollisionLayers.ENVIRONMENT,
			collisionFilterMask: CollisionLayers.PLAYER | CollisionLayers.ITEMS | CollisionLayers.PORTALS
	});
	var groundShape = new cannon.Plane();

	var groundMaterial = new cannon.Material();
	groundMaterial.friction = 0.9;

	groundShape.material = groundMaterial;
	groundBody.addShape(groundShape);
	world.addBody(groundBody);

	function add(object) {
		scene.add(object.mesh);
		if(object.body) world.addBody(object.body);
		objects.push(object);
	}
	var queueToRemove = [];
	function requestRemove(object, callback) {
		queueToRemove.push([object, callback]);
	}
	function requestDestroy(object, callback) {
		if(object && object.body) {
			with(object.body) {
				for(var i = 0; i < shapes.length; i++) {
					var shape = shapes[i];
					if(shape.radius > 0) {
						makeHitEffect(pointToWorldFrame(shapeOffsets[i]), shape.radius, 0.5);
					}
				}
			}
		}
		requestRemove(object, callback);
	}
	function remove(object, callback) {
		scene.remove(object.mesh);
		if(object.body) world.removeBody(object.body);
		var index = objects.indexOf(object);
		if(index != -1) {
			objects.splice(index, 1);
		}
		if(callback) callback();
	}



	var player = new Player(scene, camera, canvas, pointers, this);

	add(player);


	var fixedTimeStep = 1.0 / 60.0; // seconds 
	var maxSubSteps = 3;
	 
	var radius = 0.5; // m 
	var geometry = geomLib.sphere(radius, 32, 16);

	var material = new three.MeshPhongMaterial({
		color: 0xffffff,
		map: new CheckerboardTexture()
	});

	function makeBall(pos, size, vel, enviro = false) {
		var ballMesh = new three.Mesh(
			geometry,
			material
		);
		var scaler = size * (Math.random() * 0.5 + 1);
		var shape = new cannon.Sphere(radius * scaler);
		ballMesh.scale.multiplyScalar(scaler);
		shape.material = groundMaterial;
		var ballBody = new cannon.Body({
			mass: 5 * Math.pow(scaler, 3), // kg 
			position: pos, // m 
			velocity: vel, // m 
			type: enviro ? cannon.Body.STATIC : cannon.Body.DYNAMIC,
			shape: shape,
			linearDamping: 0.6,
			angularDamping: 0.6,
			// fixedRotation: true,
			collisionFilterGroup: enviro ? CollisionLayers.ENVIRONMENT : CollisionLayers.ITEMS,
			collisionFilterMask: CollisionLayers.ENVIRONMENT | CollisionLayers.PLAYER | CollisionLayers.ITEMS
		});
		ballBody.resistGravity = true;
		var ball = {
			mesh: ballMesh,
			body: ballBody
		};
		ballBody.interactiveObject = ball;
		add(ball);
		return ball;
	}

	function makeHitEffect(pos, size, duration) {
		var hit = new effects.EnergyBubblePop(pos, size, duration, remove);
		add(hit);
	}

	function weaponFireMakeBall(pos, playerSize) {
		makeBall(pos.x, pos.y, pos.z, playerSize);
	}

	// player.addTool({
	// 	primaryFireStart: weaponFireMakeBall
	// });

	var i = 0;
	for(var tool in tools){
		add(new tools[tool](this, new cannon.Vec3(i, -1, 1)));
		i += 2;
	}

	var portal = new Portal(this, new cannon.Vec3(0, 1, 1));
	add(portal);


	// Start the simulation loop 
	var lastTime;
	function simloop(time){
		requestAnimationFrame(simloop);
		if(lastTime === undefined){
			lastTime = time;
		}
		var dt = (time - lastTime) * 0.001;
		if(dt > 0) {
			world.step(fixedTimeStep, dt, maxSubSteps);
		}
		var timeScale = (1/60) / dt;
		objects.forEach(function(object) {
			if(object.onEnterFrame) object.onEnterFrame(timeScale);
			if(object.onUpdateSim) object.onUpdateSim();
			if(object.body) {
				object.mesh.position.copy(object.body.position);
				object.mesh.quaternion.copy(object.body.quaternion);
			}
		});
		if(queueToRemove.length > 0) {
			for(var i = 0; i < queueToRemove.length; i++) {
				remove(queueToRemove[i][0], queueToRemove[i][1]);
			}
			queueToRemove.length = 0;
		}
		lastTime = time;
	};

	this.portal = portal;
	this.player = player;

	this.world = world;
	this.scene = scene;


	this.add = add.bind(this);
	this.remove = requestRemove.bind(this);
	this.destroy = requestDestroy.bind(this);
	this.makeBall = makeBall.bind(this);
	this.makeHitEffect = makeHitEffect.bind(this);
	requestAnimationFrame(simloop);
}

module.exports = WorldManager;