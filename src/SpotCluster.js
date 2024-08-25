import * as turf from 'https://cdn.jsdelivr.net/npm/@turf/turf@7.1.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import concaveman from 'https://cdn.jsdelivr.net/npm/concaveman@1.2.1/+esm';
// import { clusterEmbed } from 'https://cdn.jsdelivr.net/npm/@epivecs/cluster_embedding@0.1.11/+esm';
import { clusterEmbed } from 'https://episphere.github.io/epivecs/src/cluster_embedding/dist/cluster_embedding.js';
import * as vizHelper from 'https://episphere.github.io/epivecs/src/visualization/dist/visualization.js';

import * as geometric from 'https://cdn.jsdelivr.net/npm/geometric@2.5.4/+esm';
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.16/+esm';
import * as Popper from 'https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/+esm';

class SpotCluster {
  constructor(options={}) {
    options = {
      clusterEmbeddingMethod: "kmc+sammon",
      kClusters: 6, 
      shapeSmoothing: "basis",
      shapeStrokeOpacity: 1,
      shapeStrokeWidth: 3,
      slideOpacity: .6,
      diagonalSpacing: 15,
      groupCountThreshold: 5,
      ...options
    }
    Object.assign(this, options);
    this.start();
  }

  async start() { 
    this.elements = {
      content:  document.getElementById("content"),
      dashboard: document.getElementById("dashboard"),
      slideImageContainer: document.getElementById("slide-image-container"),
      slideImage: document.getElementById("slide-image"),
      slideOverlay: document.getElementById("slide-overlay"),
      clusterContainer: document.getElementById("cluster-container"),
      clusterPlotContainer: document.getElementById("cluster-plot-container"),
      settingsPanel: document.getElementById("settings-panel"),
      settingsButton: document.getElementById("settings-button"),
    };

    this.elements.slideImage.style.opacity = this.slideOpacity;

    this.spots = await this.loadSpots();
    this.scaleFactors = await d3.json("data/scalefactors_json.json");
    this.run();

    const resizeObserver = new ResizeObserver(() => {
      this.draw();
    });
    resizeObserver.observe(this.elements.slideImage); 

    this.hookSettings();
  }

  hookSettings() {
    let settingsOpen = false; 
    this.elements.settingsButton.addEventListener("click", () => {
      settingsOpen = !settingsOpen;
      if (settingsOpen) {
        this.elements.content.classList.add("settings-open");
      } else {
        this.elements.content.classList.remove("settings-open");
      }
    });

    const inputs = document.querySelectorAll("input[type='range']");
    for (const input of inputs) {
      const span = document.querySelector(`span[for='${input.getAttribute("id")}']`);
      input.addEventListener("input", () => {
        span.innerText = input.value;
      })
      span.innerText = input.value;
    }

    const linewidthInput = document.getElementById("range-linewidth");
    linewidthInput.addEventListener("input", () => {
      this.shapeStrokeWidth = parseFloat(linewidthInput.value);
      this.draw();
    })

    const slideOpacityInput = document.getElementById("range-imageopacity");
    slideOpacityInput.addEventListener("input", () => {
      this.slideOpacity = parseFloat(slideOpacityInput.value);
      this.elements.slideImage.style.opacity = this.slideOpacity;
    });

    const kInput = document.getElementById("number-kclusters");
    kInput.addEventListener("input", () => {
      const kClusters = parseInt(kInput.value);
      console.log(kClusters);
      if (Number.isFinite(kClusters)) {
        this.kClusters = kClusters;
        this.run().then(() => this.draw());
      }
    });

    const groupThresholdInput = document.getElementById("number-groupthreshold");
    groupThresholdInput.addEventListener("input", () => {
      const groupCountThreshold = parseInt(groupThresholdInput.value);
      if (Number.isFinite(groupCountThreshold)) {
        this.groupCountThreshold = groupCountThreshold;
        this.run().then(() => this.draw());
      }
    })
  }

  draw() {
   this.#drawSlideOverlay();
   this.#drawClusterSummary()
  }

  #drawClusterSummary() {
    const bbox = this.elements.clusterPlotContainer.getBoundingClientRect();

    const points = []
    this.clusterEmbedding.centroids.forEach((v,i) => {
      v.forEach((d,j) => points.push({cellType: j, proportion: d, cluster: i}))
    })

    const spotPoints = [];
    let spot = null;
    if (this.focusSpot) {
      spot = this.spotsProcessed[this.focusSpot]
      spot.vector.forEach((d,i) => spotPoints.push({cellType: i, proportion: d, cluster: spot.cluster}));
    }
    
    const plot = Plot.plot({
      marginTop: 30, marginBottom: 50, marginLeft: 55, marginRight: 30,
      style: {fontSize: 13},
      width: bbox.width,
      height: bbox.height,
      x: {
        domain: [0,1], 
        grid: true, label: "Proportion", ticks: [0,.2,.4,.6,.8,1]
      },
      y: {
        type: "band", 
        tickFormat: d => d+1, 
        label: "Cell Type", tickSize: 0,
        tickFomat: d => d+1 
      },
      fy: { label: "Cluster", tickFormat: d => d+1 },
      marks: [
        Plot.ruleX([1], { 
          strokeWidth: 8, 
          dx:3,
           stroke: "grey", className: "cluster-plot-bar" }),
        Plot.ruleY(points, {y: "cellType", x: "proportion",  fy: "cluster"}),
        Plot.line(points, {y: "cellType", x: "proportion", z: "cluster", 
          stroke: "grey", opacity: .5, strokeDasharray: "2,3", //fill: this.spotColorer, 
        fy: "cluster", r: 4}),
        Plot.dot(points, {y: "cellType", x: "proportion", z: "cluster", 
          symbol: "cellType", opacity: d => spot && spot.cluster == d.cluster ? 0.4 : 1,
          fill: d => {
            return d.cluster == this.focusCluster ? "yellow" : "grey"
          }, //fill: this.spotColorer, 
        fy: "cluster", r: 4}),
        Plot.dot(spotPoints, {y: "cellType", x: "proportion", z: "cluster", className: "spot-points",
          stroke: "crimson",
          fy: "cluster", r: 4
        }),
        Plot.line(spotPoints, {y: "cellType", x: "proportion", z: "cluster", className: "spot-line",
          stroke: "crimson",
          fy: "cluster",  strokeDasharray: "2,3"
        }),
        
        // Plot.text(points, {text: d =>  d.cellType,  y: "cellType", x: "proportion", z: "cluster",  fy: "cluster"}),
        // Plot.text(points, {
        //   text: d => d.cellType, dx: 6, textAnchor: "start", y: "cellType", x: "proportion", z: "cluster",  
        //   fy: "cluster", opacity: 0.65
        // }),
        // Plot.frame(),
      ]
    }) 

    // d3.select(plot).select("g[aria-label='fy-axis tick label']").selectAll("g")
    //   .style("background-color", "blue")
    d3.select(plot).selectAll(".cluster-plot-bar")
      .attr("stroke", (d,i) => this.spotColorer({cluster:i}))

    this.elements.clusterPlotContainer.innerHTML = '';
    this.elements.clusterPlotContainer.appendChild(plot);
  }

  #drawSlideOverlay() {
    const bbox = this.elements.slideImage.getBoundingClientRect();
    
    const plot = Plot.plot({
      margin: 0,
      width: bbox.width,
      height: bbox.height,
      axis: null,
      x: {domain: [0,this.elements.slideImage.naturalWidth/this.scaleFactors.tissue_hires_scalef]},
      y: {reverse: true, domain: [0,this.elements.slideImage.naturalHeight/this.scaleFactors.tissue_hires_scalef]},
      marks: [
        Plot.line(this.clusterPoints, {
          x: "x", y: "y", z: "shape", strokeWidth: this.shapeStrokeWidth + 4, stroke: "white",
          curve: this.shapeSmoothing ? this.shapeSmoothing : "linear",
          className: "outer-line", 
          strokeOpacity: this.shapeStrokeOpacity,
          fill: "white", fillOpacity: 0,
        }),
        Plot.line(this.clusterPoints, {
          x: "x", y: "y", z: "shape", 
          strokeWidth: this.shapeStrokeWidth, stroke: this.spotColorer, 
          fill: d => `url(#diagonal-stripe-${d.cluster})`,
          curve: this.shapeSmoothing ? "basis" :"linear",
          className: "inner-line",
          strokeOpacity: this.shapeStrokeOpacity
        }),

        Plot.dot(this.spotsProcessed, {
          className: "all-spots",
          x: "x", y: "y", fill: this.spotColorer, stroke: "white", strokeWidth: 1, r: 3, opacity: d => d.correctlyContained ? 0 : 1,
        }),
      ]
    })

    const defs = d3.select(plot).append("defs") 
    this.clusterEmbedding.embeddedCentroids.forEach((embeddedCentroid,i) => {
      const pattern = defs.append("pattern")
        .attr("id", "diagonal-stripe-" + i)
        .attr("width", this.diagonalSpacing) 
        .attr("height", this.diagonalSpacing) 
        .attr("patternUnits", "userSpaceOnUse")
        .attr("patternTransform", `rotate(45)  translate(0, ${i*2})`);
      pattern.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", this.diagonalSpacing) 
        .attr("y2", 0)
        .style("stroke", this.colorer(embeddedCentroid))
        .attr("stroke-width", 2.5);
    })

    // d3.select(plot).selectAll(".outer-line path")
    //   .on("mouseenter", (e,d) => {
    //     this.focusCluster = this.clusterPoints[d[0]].cluster;
    //     this.#drawClusterSummary();
    //   })
    
    // d3.select(plot).select(".outer-line")
    //   .on("mouseleave", (e,d) => {
    //     this.focusCluster = null; 
    //     this.#drawClusterSummary();
    //   })

    const xScale = plot.scale("x");
    const yScale = plot.scale("y");
    const tPoints = this.spotsProcessed.map(d => [xScale.apply(d.x), yScale.apply(d.y)]);
    const delaunay = d3.Delaunay.from(tPoints);

    let allSpots = null;

    const dotSelect = d3.select(plot).selectAll("circle")
    plot.addEventListener("mousemove", (e) => {
      if (!allSpots) {
        allSpots = d3.select(plot).select(".all-spots");
        allSpots.style("pointer-events", "none");
      }

      const pointIndex = delaunay.find(e.offsetX, e.offsetY);
      const distance = euclideanDistance(tPoints[pointIndex], [e.offsetX, e.offsetY]);
      let focusIndex = null;
      if (distance < 30) {
        focusIndex = pointIndex;
      } else {
        focusIndex = null;
      }

      if (focusIndex != this.focusSpot) {
        this.focusSpot = focusIndex;
        dotSelect.attr("opacity", d => {
          if (d == focusIndex) {
            return 1
          } else {
            return this.spotsProcessed[d].correctlyContained ? 0 : 1
          }
        });
        dotSelect.attr("r", d => d == focusIndex ? 5:3);
        this.#drawClusterSummary();   
      }

     

      // if (this.focusSpot != pointIndex) {
      //   this.focusSpot = pointIndex;
      //   this.#drawClusterSummary();   
      // } else {
      //   this.focusSpot = null;
      //   this.#drawClusterSummary();   
      // }

      
    })

    this.elements.slideOverlay.innerHTML = '';
    this.elements.slideOverlay.appendChild(plot);
  }

  async run() {
    this.clusterEmbedding = await clusterEmbed(this.spots.map(d => d.vector), this.kClusters, this.clusterEmbeddingMethod);
    this.clusterEmbedding.labels.forEach((label, i) => this.spots[i].cluster = label);
    const quantizationResult = encapsulate(this.spots, {groupCountThreshold: this.groupCountThreshold});
    this.spotsProcessed = quantizationResult.points;
    this.groupShapes = quantizationResult.groupShapes;

    this.clusterPoints = [];
    this.groupShapes.forEach((shape, i) => {
      shape.areaPoints[0].forEach(p => this.clusterPoints.push({
        x: p[0], y: p[1], cluster: shape.cluster, group: shape.group, shape: i
      }));
    })

    this.colorer = vizHelper.positionColorer(this.clusterEmbedding.embeddedCentroids, [.7,.7]);
    this.spotColorer = spot => this.colorer(this.clusterEmbedding.embeddedCentroids[spot.cluster]);

  }

  async loadSpots() {
    const spotPositions = await d3.csv("data/SpotPositions.csv");
    const spotMembership = await d3.csv("data/SpotClusterMembership.csv");
    
    const positionIndex = d3.index(spotPositions, d => d.barcode)
    return spotMembership.map(row => {
      const position = positionIndex.get(row.barcode)
      const outRow = {
        barcode: row.barcode, 
        x: parseFloat(position.x),
        y: parseFloat(position.y)
      };
      outRow.vector = [...Object.keys(row)].filter(d => d.startsWith("X")).map(d => parseFloat(row[d]))
      return outRow
    })
  }
}

new SpotCluster();

export async function quantizeAndEncapsulate(spots, k, options={}) {
  const {
    clusterEmbeddingMethod = "kmc+sammon"
  } = options;

  spots = spots.map(d => ({...d}));

  const clusterEmbedding = await clusterEmbed(spots.map(d => d.vector), k, clusterEmbeddingMethod);
  clusterEmbedding.labels.forEach((label, i) => spots[i].cluster = label);
  return {
    ...encapsulate(spots, options),
    ...clusterEmbedding
  }
}

export function encapsulate(points, options={}) {
  const {
    groupDistanceThreshold = 300, // TODO: Set this automatically
    groupCountThreshold = 5,
  } = options;


  points = points.map(d => ({...d}));
  points.forEach((point,i) => {
    point.containedWithin = [];
    point._index = i;
  })

  // Group nearby same-cluster points
  const grouped = groupPoints(points, 300, "cluster");
  grouped.forEach((group, i) => group.forEach(point => point.group = i));


  // Create the draft shapes using a concave hull algorithm.
  const groupShapes = []
  for (const [_, groupPoints] of  d3.flatGroup(points, d => d.group)) {
    if (groupPoints.length >= groupCountThreshold) {
      const groupShape = {
        nPoints: groupPoints.length,
        cluster: groupPoints[0].cluster,
        group: groupPoints[0].group, 
        pointsFeature: turf.featureCollection(groupPoints.map(d => turf.point([d.x, d.y])))
      }

      groupPoints.forEach((point, i) => groupShape.pointsFeature.features[i].properties.point = point)

      groupShape.areaPoints = [concaveman(groupPoints.map(d => [d.x, d.y]), 2, 0)];
      try {
        groupShape.areaFeature = turf.polygon(groupShape.areaPoints);
        groupShapes.push(groupShape);
      } catch (e) {}
    }
  }

  // Find where the draft shapes intersect.
  const intersections = []
  for (let i = 0; i < groupShapes.length-1; i++) {
    for (let j = i+1; j < groupShapes.length; j++) {
      const intersectionFeature = turf.intersect(
        turf.featureCollection([groupShapes[i].areaFeature, groupShapes[j].areaFeature]))
      if (intersectionFeature) {
        let featurePoints = turf.getCoords(intersectionFeature);
        if (intersectionFeature.geometry.type == "Polygon") {
          featurePoints = [featurePoints]
        }
        for (const subShapePoints of featurePoints) {
          const intersection = { 
            shape1: groupShapes[i], 
            shape2: groupShapes[j], 
            points: subShapePoints, 
            feature: turf.polygon(subShapePoints)
          }
          intersections.push(intersection)
        }
      }
    }
  }


  // Subtract intersecting shapes from each other. The shape with fewer correct-label points gets subtracted.
  for (const intersection of intersections) {
    const nPointsWithin1 = turf.pointsWithinPolygon(
      intersection.shape1.pointsFeature, intersection.feature).features.length;
    const nPointsWithin2 = turf.pointsWithinPolygon(
      intersection.shape2.pointsFeature, intersection.feature).features.length;

    if (nPointsWithin1 > nPointsWithin2) {
      intersection.shape2.areaFeature = turf.difference(
        turf.featureCollection([intersection.shape2.areaFeature, intersection.shape1.areaFeature]))
    } else {
      intersection.shape1.areaFeature = turf.difference(
        turf.featureCollection([intersection.shape1.areaFeature, intersection.shape2.areaFeature]))
    }
  }

  const allPointsFeature = turf.featureCollection(points.map(d => turf.point([d.x, d.y])));
  points.forEach((point, i) => allPointsFeature.features[i].properties.point = point);

  // Finalize the shapes.
  groupShapes.forEach((groupShape,i) => {
    groupShape.areaPoints = turf.getCoords(groupShape.areaFeature);
    // const containedFeature = turf.pointsWithinPolygon(groupShape.pointsFeature, groupShape.areaFeature);
    const containedFeature = turf.pointsWithinPolygon(allPointsFeature, groupShape.areaFeature);
    containedFeature.features.forEach(feature => feature.properties.point.containedWithin.push(i));
    groupShape.containedFeature = containedFeature
    groupShape.nPoints = containedFeature.features.length
    groupShape.areaCentroid = geometric.polygonCentroid(groupShape.areaPoints[0])
  })

  for (const point of points) {
    point.correctlyContained = false;
    point.uncontained = point.containedWithin.length == 0;
    point.containedWithin.forEach(shapeIndex => {
      const shape = groupShapes[shapeIndex]
      if (shape.cluster == point.cluster) {
        point.correctlyContained = true;
      } 
    })
  }

  return { groupShapes, points };
}

function groupPoints(points, threshold, labelField="label") {
  const groups = [];
  const visited = new Set();

  function dfs(point, group) {
    visited.add(point);
    group.push(point);

    for (const neighbor of points) {
      if (!visited.has(neighbor) && neighbor[labelField] == point[labelField] &&
        distance(point, neighbor) <= threshold) {
        dfs(neighbor, group);
      }
    }
  }

  function distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  for (const point of points) {
    if (!visited.has(point)) {
      const newGroup = [];
      dfs(point, newGroup);
      groups.push(newGroup);
    }
  }

  return groups;
}

// function addOpenableSettings(container, buttonElement, label, content) {
//   const buttonLabel = document.createElement("div")
//   buttonLabel.classList.add("button-label")
//   buttonLabel.innerText = label 

//   Popper.createPopper(buttonElement, buttonLabel, {
//     placement: "right",
//     modifiers: [
//       {
//         name: 'offset',
//         options: {
//           offset: [-15, 20],
//         },
//       },
//       {
//         name: 'preventOverflow',
//         options: {
//           boundary: container,
//         },
//       },
//     ],
//   })

  
//   const settingsContentWrapper = document.createElement("div")
//   settingsContentWrapper.classList.add("openable-settings")
//   settingsContentWrapper.classList.add("custom-tooltip")
//   Popper.createPopper(buttonElement, settingsContentWrapper, {
//     placement: "right",
//     modifiers: [
//       {
//         name: 'offset',
//         options: {
//           offset: [-15, 20],
//         },
//       },
//       {
//         name: 'preventOverflow',
//         options: {
//           boundary: container,
//         },
//       },
//     ],
//   })


//   function setOpened(opened) {
//     if (opened) {
//       const settingsTemplate = document.getElementById("settings-template")
//       const settingsContent = document.getElementById("settings-content")
//       const settingsTitle = document.getElementById("settings-title")
//       settingsTitle.innerText = label

//       settingsContent.innerHTML = '' 
//       settingsContent.appendChild(content)
  
//       settingsContentWrapper.style.display = "block"
//       settingsContentWrapper.innerHTML = ''
//       settingsContentWrapper.appendChild(settingsTemplate)

//       settingsContentWrapper.setAttribute("opened", "true")
//       const otherSettings = [...document.querySelectorAll(".openable-settings")].filter(d => d != settingsContentWrapper)
//       otherSettings.forEach(elem => elem.setOpened(false))
//     } else { 
//       settingsContentWrapper.removeAttribute("opened")
//       settingsContentWrapper.style.display = "none"
//     }
//   }
//   settingsContentWrapper.setOpened = setOpened

//   // settingsContentWrapper.addEventListener("click", e => e.stopPropagation())

//   buttonElement.addEventListener("mouseover", () => {
//     buttonLabel.style.display = "block"
//   })

//   buttonElement.addEventListener("mouseleave", () => {
//     buttonLabel.style.display = "none"
//   })

//   if (!buttonElement.hasAttribute("noopen")) {
//     buttonElement.addEventListener("click" , (e) => {
//       e.stopPropagation()
//       setOpened(!settingsContentWrapper.getAttribute("opened"))
//     })
//   }
  

//   document.getElementById("settings-close").addEventListener("click", () => {
//     setOpened(false)
//   })

//   container.addEventListener("click", () => {
//     setOpened(false)
//   })

//   container.appendChild(buttonLabel)
//   container.appendChild(settingsContentWrapper)

//   return {setOpened}
// }

function euclideanDistance(point1, point2) {
  let sumOfSquares = 0;
  for (let i = 0; i < point1.length; i++) {
    sumOfSquares += Math.pow(point1[i] - point2[i], 2);
  }

  return Math.sqrt(sumOfSquares);
}

function addPopperTooltip(element) {

  const tooltipElement = document.createElement("div")
  tooltipElement.classList.add("custom-tooltip")
  element.appendChild(tooltipElement)

  let popper = null
  function show(targetElement, html) {
    if (popper) popper.destroy()
    popper = Popper.createPopper(targetElement, tooltipElement, {
      placement: "bottom",
      modifiers: [
        {
          name: 'offset',
          options: {
            offset: [20, 20],
          },
        },
        {
          name: 'preventOverflow',
          options: {
            boundary: element,
          },
        },
      ],
    })

    if (html instanceof Element) {
      tooltipElement.innerHTML = ``
      tooltipElement.appendChild(html)
    } else {
      tooltipElement.innerHTML = html
    }

    tooltipElement.style.display = "block"
  }

  function hide() {
    tooltipElement.style.display = "none"
  }

  return { show, hide }
}