const util = require('util');
// ref: https://jestjs.io/docs/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom
// ref: https://github.com/jsdom/jsdom/issues/2524
Object.defineProperty(window, 'TextEncoder', {
  writable: true,
  value: util.TextEncoder,
});
Object.defineProperty(window, 'TextDecoder', {
  writable: true,
  value: util.TextDecoder,
});

const { createCanvas } = require('canvas');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const xmlserializer = require('xmlserializer');
const { Canvas } = require('@antv/g');
const { Renderer } = require('@antv/g-svg');
const d3 = require('d3');
const { sleep } = require('../../util');
const weatherDataset = require('../../data/weather.json');

// create a renderer, unregister plugin relative to DOM
const renderer = new Renderer();
const domInteractionPlugin = renderer.getPlugin('dom-interaction');
renderer.unregisterPlugin(domInteractionPlugin);

const dom = new JSDOM(`
<div id="container">
</div>
`);

const WIDTH = 600;
const HEIGHT = 500;

const offscreenNodeCanvas = createCanvas(1, 1);

const canvas = new Canvas({
  container: 'container',
  width: WIDTH,
  height: HEIGHT,
  renderer,
  document: dom.window.document,
  offscreenCanvas: offscreenNodeCanvas,
  requestAnimationFrame: dom.window.requestAnimationFrame,
  cancelAnimationFrame: dom.window.cancelAnimationFrame,
});

const RESULT_IMAGE = '/d3-linechart.svg';
const BASELINE_IMAGE_DIR = '/snapshots';

describe('Render D3 linechart with g-svg', () => {
  afterEach(() => {
    canvas.removeChildren();
  });

  afterAll(() => {
    canvas.destroy();
  });

  it('should render d3 linechart on server-side correctly.', async () => {
    await canvas.ready;
    const drawLineChart = () => {
      // 1. Access data
      const data = weatherDataset;
      const parseDate = d3.timeParse('%Y-%m-%d');
      //define x axis with xAccessor, wrape with parseDate from above
      const xAccessor = (d) => parseDate(d['date']);
      const yAccessor = (d) => d['temperatureMax'];

      // 2. Create chart dimensions
      const width = 600;
      let dimensions = {
        width: width,
        height: width * 0.6,
        margin: {
          top: 30,
          right: 10,
          bottom: 50,
          left: 50,
        },
      };
      dimensions.boundedWidth =
        dimensions.width - dimensions.margin.left - dimensions.margin.right;
      dimensions.boundedHeight =
        dimensions.height - dimensions.margin.top - dimensions.margin.bottom;

      // 3. Draw canvas
      const container = d3
        .select(
          canvas.document.documentElement, // use GCanvas' document element instead of a real DOM
        )
        .append('g')
        .attr('x', dimensions.margin.left)
        .attr('y', dimensions.margin.top);

      // 4. Create scales

      const yScale = d3
        .scaleLinear()
        //domain is the min and max input value, range is min and max output
        //domain should be the smallest and largest numbers our y axis will need to handle — in this case the lowest and highest max temperature in our dataset.
        // could define ourselves with .domain([0, 100])
        //better to use d3.extent, which will figure if out for us
        //needs two parameters, the data and the yAccessor (temp max)
        .domain(d3.extent(data, yAccessor))
        //range, in this case, should be min and max on xaxis. Can use boundedHeight to stay within margins
        .range([dimensions.boundedHeight, 0]);

      //Draw a rectangle covering all temps below freezing.
      //define scale - 32 degrees
      const freezingTemperaturePlacement = yScale(32);
      //create the rectangle with x,y, width and height
      const freezingTemperatures = container
        .append('rect')
        .attr('x', 0)
        .attr('width', dimensions.boundedWidth)
        .attr('y', freezingTemperaturePlacement)
        .attr('height', dimensions.boundedHeight - freezingTemperaturePlacement)
        .attr('fill', '#e0f3f3');

      const xScale = d3
        .scaleTime()
        .domain(d3.extent(data, xAccessor))
        .range([0, dimensions.boundedWidth]);

      // 5. Draw data

      //We transform our data point with both the accessor function and the scale to get the scaled value in pixel space.

      const lineGenerator = d3
        .line()
        .x((d) => xScale(xAccessor(d)))
        .y((d) => yScale(yAccessor(d)));

      //Now add the path element to the points
      // Will be filled by default. Use styles to add a stroke
      const line = container
        .append('path')
        .attr('d', lineGenerator(data))
        .attr('fill', 'none')
        .attr('stroke', '#af9358')
        .attr('stroke-width', 2);

      // 6. Draw Axis

      const yAxisGenerator = d3.axisLeft().scale(yScale);

      const yAxis = container.append('g').call(yAxisGenerator);

      const xAxisGenerator = d3.axisBottom().scale(xScale);

      const xAxis = container
        .append('g')
        .call(xAxisGenerator)
        .style('transform', `translateY(${dimensions.boundedHeight}px)`);
    };

    drawLineChart();

    await sleep(120);

    // fs.writeFileSync(
    //   __dirname + RESULT_IMAGE,
    //   xmlserializer.serializeToString(
    //     dom.window.document.getElementById('container').children[0],
    //   ),
    // );

    const snapshot = fs.readFileSync(
      __dirname + BASELINE_IMAGE_DIR + RESULT_IMAGE,
      {
        encoding: 'utf8',
        flag: 'r',
      },
    );

    expect(
      xmlserializer.serializeToString(
        dom.window.document.getElementById('container').children[0],
      ),
    ).toBe(snapshot);
  });
});
