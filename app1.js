import * as THREE from "https://threejsfundamentals.org/threejs/resources/threejs/r132/build/three.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GeoTIFF from "geotiff";
import * as GEOLIB from "geolib";

import { BufferGeometry } from "three";

const center = [47.0852686, -21.4563308];
let scene,
  camera,
  renderer,
  controls,
  raycaster,
  MAT_BUILDING,
  MAT_ROADS = null,
  collider_building = [];
var Animated_Line_Distances = [];
const FLAG_ROAD_ANI = true;
let iR;
let iR_Roads = null;
var iR_Line = null;

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);
  //scene.fog = new THREE.FogExp2(0x222222, 0.04);

  camera = new THREE.PerspectiveCamera(
    25,
    window.innerWidth / window.innerHeight,
    1,
    100
  );
  camera.position.set(8, 4, 0);

  // Init group
  iR = new THREE.Group();
  iR.name = "Interactive Root";
  iR_Roads = new THREE.Group();
  iR_Roads.name = "Roads";
  iR_Line = new THREE.Group();
  iR_Line.name = "Animated Line on Roads";
  scene.add(iR);
  scene.add(iR_Roads);
  scene.add(iR_Line);

  raycaster = new THREE.Raycaster();

  // Créer un groupe pour les routes
  iR_Roads = new THREE.Group();
  iR_Roads.name = "Roads";

  // Ajouter le groupe directement à la scène
  scene.add(iR_Roads);

  // Lights

  let light0 = new THREE.AmbientLight(0xfafafa, 0.25);

  let light1 = new THREE.PointLight(0xfafafa, 0.4);
  light1.position.set(200, 90, 40);

  let light2 = new THREE.PointLight(0xfafafa, 0.4);
  light2.position.set(200, 90, -40);

  scene.add(light0);
  scene.add(light1);
  scene.add(light2);

  const gridHelper = new THREE.GridHelper(
    80,
    100,
    new THREE.Color(0x555555),
    new THREE.Color(0x333333)
  );
  scene.add(gridHelper);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  document.getElementById("cont").appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);

  // controls.addEventListener( 'change', render ); // Call this only in static scenes (i.e., if there is no animation loop)

  controls.enableDamping = true; // An animation loop is required when either damping or auto-rotation is enabled
  controls.dampingFactor = 0.05;

  controls.screenSpacePanning = false;
  controls.minDistance = 3.5;
  controls.maxDistance = 55;

  controls.maxPolarAngle = Math.PI / 2.1;

  controls.update();

  MAT_BUILDING = new THREE.MeshPhongMaterial();

  getGeoJson();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  controls.update();
  UpdateAniLine();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onWindowResize);

document.getElementById("cont").addEventListener("mousedown", (event) => {
  let mouse = {
    x: (event.clientX / window.innerWidth) * 2 - 1,
    y: -(event.clientY / window.innerHeight) * 2 + 1,
  };

  let hitted = Fire(mouse);
  if (hitted && hitted.info) {
    console.log(hitted.info);
  } else {
    console.log(hitted);
  }
});

function getGeoJson() {
  fetch("./assets/edinburgh_road.geojson")
    .then((res) => res.json())
    .then((data) => {
      loadBuildings(data);
    })
    .catch((error) => {
      console.error("Error fetching GeoJSON:", error);
    });
}

function loadBuildings(data) {
  const features = data.features;
  const matRoads = new THREE.LineBasicMaterial({ color: 0x2a5175 });

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];

    if (!feature.properties) {
      console.warn("Invalid GeoJSON feature:", feature);
      continue;
    }

    const info = feature.properties;

    if (info.building) {
      addBuilding(feature.geometry.coordinates, info, info["building:levels"]);
    } else if (info.highway) {
      if (
        feature.geometry.type == "LineString" &&
        info["highway"] != "pedestrian" &&
        info["highway"] != "footway" &&
        info["highway"] != "path"
      ) {
        addRoad(feature.geometry.coordinates, info, matRoads);
      }
    }
  }
}

function addBuilding(data, info, Height = 1) {
  let shape, geometry;
  let holes = [];

  for (let i = 0; i < data.length; i++) {
    const el = data[i];

    if (i === 0) {
      shape = genShape(el, center);
    } else {
      holes.push(genShape(el, center));
    }
  }

  for (let h = 0; h < holes.length; h++) {
    shape.holes.push(holes[h]);
  }

  geometry = genGeometry(shape, {
    curveSegments: 1,
    depth: 0.1 * Height,
    bevelEnabled: false,
  });

  geometry.rotateX(Math.PI / 2);
  geometry.rotateZ(Math.PI);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial());
  scene.add(mesh);

  let helper = genHelper(geometry);
  if (helper) {
    helper.name = info["name"] ? info["name"] : "Building";
    helper.info = info;
    collider_building.push(helper);
  }
}

function addRoad(data, info, matRoads) {
  let points = [];

  for (let i = 0; i < data.length; i++) {
    if (!data[0][1]) return;

    let el = data[i];

    if (!el[0] || !el[1]) return;

    let elp = [el[0], el[1]];

    elp = GPSRelativePosition(elp, center);

    points.push(new THREE.Vector3(elp[0], 0.5, elp[1]));
  }

  let geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.rotateZ(Math.PI);

  let line = new THREE.Line(geometry, matRoads);
  line.info = info;

  // Instead of using computeBoundingBox, calculate dimensions manually
  let boundingBox = new THREE.Box3().setFromBufferAttribute(
    geometry.attributes.position
  );
  line.userData.dimensions = boundingBox.getSize(new THREE.Vector3());

  iR_Roads.add(line);

  line.position.set(line.position.x, 0.5, line.position.Z);

  if (FLAG_ROAD_ANI) {
    // Calculate the length of the line
    let lineLength = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const point1 = points[i];
      const point2 = points[i + 1];
      lineLength += point1.distanceTo(point2);
    }

    if (lineLength > 0.8) {
      let aniLine = AddAniLine(geometry, lineLength);
      iR_Line.add(aniLine);
    }
  }
}

function AddAniLine(geometry, length) {
  let aniLine = new THREE.Line(
    geometry,
    new THREE.LineDashedMaterial({ color: 0x00ffff, linewidth: 5 })
  );
  aniLine.material.transparent = true;
  aniLine.position.y = 0.5;
  aniLine.material.dashSize = 0;
  aniLine.material.gapSize = 1000;
  Animated_Line_Distances.push(length);
  return aniLine;
}

function UpdateAniLine() {
  if (iR_Line.children.length <= 0) return;

  for (let i = 0; i < iR_Line.children.length; i++) {
    let line = iR_Line.children[i];

    let dash = parseInt(line.material.dashSize);
    let length = parseInt(Animated_Line_Distances[i]);

    if (dash > length) {
      line.material.dashSize = 0;
      line.material.opacity = 1;
    } else {
      line.material.dashSize += 0.004;
      line.material.opacity =
        line.material.opacity > 0 ? line.material.opacity - 0.002 : 0;
    }
  }
}

function genHelper(geometry) {
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  let box3 = geometry.boundingBox;
  if (!isFinite(box3.max.x)) {
    return null; // Return null if the bounding box is not valid
  }
  let helper = new THREE.Box3Helper(box3, 0xffff00);
  helper.updateMatrixWorld();
  return helper;
}

function genShape(points, center) {
  const shape = new THREE.Shape();

  for (let i = 0; i < points.length; i++) {
    let elp = points[i];

    elp = GPSRelativePosition(elp, center);

    if (i === 0) {
      shape.moveTo(elp[0], elp[1]);
    } else {
      shape.lineTo(elp[0], elp[1]);
    }
  }

  return shape;
}

function genGeometry(shape, config) {
  const geometry = new THREE.ExtrudeGeometry(shape, config);
  geometry.computeBoundingBox();

  return geometry;
}

function Fire(pointer) {
  raycaster.setFromCamera(pointer, camera);

  let intersects = raycaster.intersectObjects(collider_building, true);
  if (intersects.length > 0) {
    return intersects[0].object;
  } else {
    return null;
  }
}

function GPSRelativePosition(objPosi, centerPosi) {
  // Get GPS distance
  const dis = GEOLIB.getDistance(objPosi, centerPosi);

  // Get direction angle
  const bearing = GEOLIB.getRhumbLineBearing(objPosi, centerPosi);

  // Calculate x by centerPosi.x + distance * cos(rad)
  const x = centerPosi[0] + dis * Math.cos((bearing * Math.PI) / 180);

  // Calculate y by centerPosi.y + distance * sin(rad)
  const y = centerPosi[1] + dis * Math.sin((bearing * Math.PI) / 180);

  // Invert x (it works)
  return [-x / 100, y / 100];
}
