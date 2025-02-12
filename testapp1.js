import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Text } from "troika-three-text";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import GeoTIFF from "geotiff";
import * as GEOLIB from "geolib";
import { BufferGeometry } from "three";
import gsap from "gsap";
import GUI from "lil-gui";
import sphere360 from "./img/vita360_stitch.jpg";
import earth from "./img/cartedemode360.jpg";

const center = [47.0852686, -21.4563308];
let scene,
  camera,
  renderer,
  controls,
  scene360,
  camera360,
  controls360,
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

  camera = new THREE.PerspectiveCamera(
    25,
    window.innerWidth / window.innerHeight,
    1,
    100
  );
  camera.position.set(8, 4, 0);

  // Create the new scene
  scene360 = new THREE.Scene();
  scene360.background = new THREE.Color(0xffffff);

  // Create the new camera
  camera360 = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.001,
    1000
  );
  camera360.position.x = -3;

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
  lighting();  // Ajoutez cette ligne pour appeler la fonction lighting()

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

  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 3.5;
  controls.maxDistance = 55;
  controls.maxPolarAngle = Math.PI / 2.1;

  // Create the new controls
  controls360 = new OrbitControls(camera360, renderer.domElement);
  controls360.enableDamping = true;
  controls360.dampingFactor = 0.05;
  controls360.screenSpacePanning = false;
  controls360.enableZoom = false;
  controls360.maxPolarAngle = Math.PI / 1.5;
  controls360.minPolarAngle = 0.9;

  controls.update();

  MAT_BUILDING = new THREE.MeshPhongMaterial();

  create360();
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

function create360() {
  // Nettoyer la scène avant d'ajouter de nouveaux éléments
  while (scene360.children.length > 0) {
    scene360.remove(scene360.children[0]);
  }

  const geometry = new THREE.SphereGeometry(10, 30, 30);
  let t = new THREE.TextureLoader().load(sphere360);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = -1;
  const material = new THREE.MeshBasicMaterial({
    map: t,
    side: THREE.BackSide,
  });
  const sphere = new THREE.Mesh(geometry, material);
  scene360.add(sphere);

  // Create:
  const myText = new Text();
  scene360.add(myText);

  // Set properties to configure:
  myText.text = "Studio EMIT";
  myText.fontSize = 1;
  myText.anchorX = "center";
  myText.font = "./fonts/Montserrat-Regular.otf";
  myText.position.z = -4;
  myText.color = 0x9ec3e9;

  console.log("Scene 360 created with text:", myText.text);

  // Update the rendering:
  myText.sync();
}

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

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );

  if (geometry instanceof THREE.ExtrudeGeometry) {
    mesh.material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 30,
    });
  }

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

  let boundingBox = new THREE.Box3().setFromBufferAttribute(
    geometry.attributes.position
  );
  line.userData.dimensions = boundingBox.getSize(new THREE.Vector3());

  iR_Roads.add(line);

  line.position.set(line.position.x, 0.5, line.position.Z);

  if (FLAG_ROAD_ANI) {
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
    return null;
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
  const dis = GEOLIB.getDistance(objPosi, centerPosi);
  const bearing = GEOLIB.getRhumbLineBearing(objPosi, centerPosi);
  const x = centerPosi[0] + dis * Math.cos((bearing * Math.PI) / 180);
  const y = centerPosi[1] + dis * Math.sin((bearing * Math.PI) / 180);

  return [-x / 100, y / 100];
}

// Nouvelle fonction pour l'éclairage
function lighting() {
  const ambient = new THREE.AmbientLight(0xfafafa, 0.25);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffffbb, 0x080820, 1);
  scene.add(hemi);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(50, 50, -50);
  scene.add(directionalLight);
}
