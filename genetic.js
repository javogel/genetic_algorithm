/*
 * Genetic Algorithm
 * Written by Johannus Vogel
 *
 * Inspired on `Genetic Algorithm' - Copyright (c) 2013 by Chris Cummins.
 * https://chriscummins.cc/genetics
 */


const canvasSketch = require('canvas-sketch');
const load = require('load-asset');
const random = require('canvas-sketch-util/random');
const { pop } = require('load-asset/loaders');

const settings = {
  animate: true,
  fps: 1
};
const PHENOTYPE = 'circles'
const DRAWING_COLOR = ""
const OVERLAPP_IMAGE = false
const SIDE_COMPARE = false
const SURVIVAL_RATE = 0.2
const MUTATE_CONTINUOUSLY = true
const MUTATION_CHANCE = 0.01
const MUTATION_IMPACT = 0.1
const DNA_LENGTH = 100
const POPULATION_SIZE = 50
const USE_DIFF_SQUARED = true
const RATIO_REDUCTION_FACTOR = 5
const PRINT_TOP_FITNESS = true;
const RECESSIVE_GENES = true;
const GENE_LENGTH = {
  bezier: 7,
  lines: 5,
  circles: 8,
  dots: 7,
  mixed: 10
}

let targetSize = []
let lifeCanvas, lifeContext;
let targetData;

const sketch = async () => {
  const image = await load('assets/hh.jpg');
  targetSize = [image.width / RATIO_REDUCTION_FACTOR, image.height / RATIO_REDUCTION_FACTOR]
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = targetSize[0];
  targetCanvas.height = targetSize[1];
  const targetContext = targetCanvas.getContext('2d');
  targetContext.drawImage(image, 0, 0, targetCanvas.width, targetCanvas.height);
  targetData = targetContext.getImageData(0, 0, targetCanvas.width, targetCanvas.height).data;


  lifeCanvas = document.createElement('canvas');
  lifeCanvas.width = targetSize[0];
  lifeCanvas.height = targetSize[1];
  lifeContext = lifeCanvas.getContext('2d');
  lifeContext.fillStyle = 'white';


  const population = new Population(POPULATION_SIZE)

  let i = 0
  return ({ context, width, height }) => {
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);



    population.iterate()

    if (PRINT_TOP_FITNESS) {
      console.log(i++, population.fittest.fitness)
    }


    if (SIDE_COMPARE) {
      context.drawImage(image, targetCanvas.width, 0, targetCanvas.width, targetCanvas.height);
      population.fittest.draw(context, targetCanvas.width, targetCanvas.height)
    } else if (OVERLAPP_IMAGE) {
      context.drawImage(image, 0, 0, image.width, image.height);
      population.fittest.draw(context, image.width, image.height)
    } else {
      const renderParams = getCenteringParameters([image.width, image.height], [width, height])
      context.translate(renderParams.translate.x, renderParams.translate.y)
      population.fittest.draw(context, renderParams.dimensions[0], renderParams.dimensions[1])
    }



  };
};

canvasSketch(sketch, settings);




class Population {
  constructor(size) {
    this.individuals = this.populate(size)
    this.size = size
    this.sortIndividualsByFitness()
    this.fittest = this.individuals[0]
  }

  populate(size) {
    let individuals = []
    for (let i = 0; i < size; i++) {
      individuals.push(new Individual())
    }
    return individuals
  }

  sortIndividualsByFitness() {
    this.individuals = this.individuals.sort((a, b) => {
      return b.fitness - a.fitness
    })
    return this.individuals
  }

  iterate() {
    this.sortIndividualsByFitness()

    this.fittest = this.individuals[0]

    const cutoff = Math.floor(SURVIVAL_RATE * this.individuals.length)

    this.individuals = new Array(this.size).fill(0).map((_) => {
      let [mother, father] = [{}, {}];

      while (mother.name == father.name) {
        mother = this.getFitParent(cutoff)
        father = this.getFitParent(cutoff)

      }

      return new Individual(mother, father)
    })


  }

  getFitParent(cutoff) {
    let rGauss = Math.abs(random.gaussian(0, 1))
    rGauss = rGauss > 1 ? random.value() : rGauss;
    const index = Math.floor(rGauss * cutoff)
    return this.individuals[index]
  }
}

class Individual {
  constructor(mother = undefined, father = undefined, dnaLength = DNA_LENGTH, phenotype = PHENOTYPE) {
    this.phenotype = phenotype
    this.dnaLength = dnaLength
    this.geneLength = Renderer.dataPointsNeededFor(phenotype)
    this.dna = Individual.generateDNA(father, mother, dnaLength, this.geneLength)
    this.fitness = Individual.calculateFitness(USE_DIFF_SQUARED, this.dna, phenotype)
    this.name = uuidv4()

  }

  static generateDNA(father, mother, dnaLength, geneLength) {
    if (father && mother) {
      return Individual.inheritDNAFrom(father, mother)
    } else {
      return Individual.generateOrphanDNA(dnaLength, geneLength)
    }
  }

  static inheritDNAFrom(father, mother) {
    const splitIndex = Math.floor(Math.random() * this.dnaLength)
    const dna = mother.dna.map((motherGene, index) => {
      let childGene = Math.random() < 0.5 ? motherGene : father.dna[index]
      if (index > splitIndex) {
        childGene = motherGene
      } else {
        childGene = father.dna[index]
      }

      return Individual.maybeMutate(childGene)
    })

    return dna
  }

  static maybeMutate(gene) {
    if (MUTATE_CONTINUOUSLY) {
      return Individual.mutateGene(gene)
    } else {
      return Individual.mutateRandom(gene)
    }
  }

  static mutateRandom(gene) {
    return gene.map((g) => {
      if (Math.random() < MUTATION_CHANCE) {
        return Math.random()
      } else {
        return g
      }
    })


  }

  static mutateGene(gene) {
    return gene.map((g) => {
      let candidate = g
      if (Math.random() < MUTATION_CHANCE) {
        let mutation = MUTATION_IMPACT * (Math.random() * 2 - 1)
        candidate = candidate + mutation
        candidate = candidate < 0 ? Math.random() : candidate;
        candidate = candidate > 1 ? Math.random() : candidate;
      }
      return candidate
    })
  }

  static generateOrphanDNA(dnaLength, geneLength) {
    const dna = []
    for (var g = 0; g < dnaLength; g += 1) {
      dna.push(new Array(geneLength).fill(0).map(_ => Math.random()))
    }
    return dna
  }

  static calculateFitness(diffSquared, dna, phenotype) {
    const targetPixelCount = targetData.length
    const currentData = Individual.getRenderData(dna, phenotype)
    let diff = 0
    let fitness = 0
    if (diffSquared) {  // Sum squared differences.
      for (var p = 0; p < targetPixelCount; p++) {
        var dp = currentData[p] - targetData[p];
        diff += dp * dp;
      }
      fitness = 1 - diff / (targetPixelCount * 256 * 256);
    } else {  // Sum differences.
      for (var p = 0; p < targetPixelCount; p++)
        diff += Math.abs(currentData[p] - targetData[p]);
      fitness = 1 - diff / (targetPixelCount * 256);
    }
    return fitness
  }


  static getRenderData(dna, phenotype) {
    lifeContext.fillStyle = 'white';
    lifeContext.fillRect(0, 0, targetSize[0], targetSize[1]);
    Renderer.draw(lifeContext, targetSize[0], targetSize[1], dna, phenotype)

    return lifeContext.getImageData(0, 0, targetSize[0], targetSize[1]).data;
  }

  draw(context, width, height, imageDimensions) {
    Renderer.draw(context, width, height, this.dna, this.phenotype, imageDimensions)
  }

}

class Renderer {
  static draw(context, width, height, dna, phenotype, imageDimensions = [0, 0]) {
    if (!OVERLAPP_IMAGE) {
      context.fillStyle = 'white';
      context.fillRect(0, 0, width, height);
    }

    context.strokeStyle = DRAWING_COLOR

    for (let i = 0; i < dna.length; i += 1) {
      if (RECESSIVE_GENES && dna[i][0] > 0.5) continue; // do not draw if "inactive"
      context.save()
      Renderer.drawFor(phenotype)(context, width, height, dna[i])
      context.restore()
    }
  }

  static dataPointsNeededFor(phenotype) {
    return GENE_LENGTH[phenotype]
  }

  static drawFor(phenotype) {
    let capitalizedPhenotype = phenotype.charAt(0).toUpperCase() + phenotype.slice(1)
    return Renderer["draw" + capitalizedPhenotype]

  }

  static drawCircles(context, width, height, gene) {
    const [active, radius, centerX, centerY, red, green, blue, alpha] = gene
    context.fillStyle = `rgba(${Math.floor(red * 255)},${Math.floor(green * 255)}, ${Math.floor(blue * 255)}, ${alpha - 0.3})`;
    const r = radius * (height / 15)
    context.beginPath();
    context.moveTo(width * centerX + r, height * centerY);
    context.arc(width * centerX, height * centerY, r, 0, 2 * Math.PI);
    context.closePath()
    context.fill()
  }

  static drawDots(context, width, height, gene) {
    const [active, centerX, centerY, red, green, blue, alpha] = gene
    context.fillStyle = `rgba(${Math.floor(red * 255)},${Math.floor(green * 255)}, ${Math.floor(blue * 255)}, ${alpha - 0.3})`;
    const r = Math.min(width, height) / 50
    context.beginPath();
    context.moveTo(width * centerX + r, height * centerY);
    context.arc(width * centerX, height * centerY, r, 0, 2 * Math.PI);
    context.closePath()
    context.fill()
  }

  static drawBezier(context, width, height, gene) {
    const [active, fromX, fromY, toX, toY, controlX, controlY] = gene
    context.beginPath();
    context.moveTo(width * fromX, height * fromY)
    context.quadraticCurveTo(width * controlX, height * controlY, width * toX, height * toY)
    context.stroke();
  }

  static drawLines(context, width, height, gene) {
    const [active, fromX, fromY, toX, toY, red, blue, green, alpha] = gene
    context.strokeStyle = `rgba(${Math.floor(red * 255)},${Math.floor(green * 255)}, ${Math.floor(blue * 255)}, ${alpha})`;
    context.lineWidth = Math.min(width, height) / 200;
    context.beginPath();
    context.moveTo(width * fromX, height * fromY)
    context.lineTo(width * toX, height * toY)
    context.stroke();
  }

  static drawMixed(context, width, height, gene) {
    const [a, p, ...g] = gene
    let renderer;
    if (p < 0.2) {
      renderer = Renderer.drawLines
    } else if (p < 0.4) {
      renderer = Renderer.drawBezier
    } else if (p < 0.6) {
      renderer = Renderer.drawDots
    } else if (p < 1) {
      renderer = Renderer.drawCircles
    }
    renderer(context, width, height, [a, ...g])

  }
}
function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}


function getCenteringParameters(imageDimensions, canvasDimensions) {
  const imageRatio = imageDimensions[0] / imageDimensions[1]
  const canvasRatio = canvasDimensions[0] / canvasDimensions[1]
  let translate, dimensions
  if (imageRatio > canvasRatio) {
    dimensions = [canvasDimensions[0], canvasDimensions[0] * (1 / imageRatio)]
    translate = { x: 0, y: (canvasDimensions[1] - dimensions[1]) / 2 }
  } else {
    dimensions = [canvasDimensions[1] * imageRatio, canvasDimensions[1]]
    translate = { x: (canvasDimensions[0] - dimensions[0]) / 2, y: 0 }
  }
  return { dimensions, translate }
}