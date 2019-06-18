#!/usr/bin/env node
"use strict";
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const program = require('commander');
const DBPF = require('../lib/dbpf');
const FileType = require('../lib/file-types');
const pkg = require('../package.json');

const Style = {
	"Chicago": 0x00002000,
	"NewYork": 0x00002001,
	"Houston": 0x00002002,
	"Euro": 0x00002003
};

// Main program options.
program
	.name('sc4')
	.version(pkg.version);

program
	.command('historical [city]')
	.option('--force', 'Force override of the city')
	.option('-o --output', 'The output path to store the city if you\'re not force-overriding')
	.action(async function(city) {
		
		let dir = process.cwd();
		let file = path.resolve(dir, city);
		let ext = path.extname(file);
		if (ext !== '.sc4') throw new Error(`${file} is not a SimCity 4 savegame!`);

		// Read in the city.
		console.log(chalk.cyan('READING'), file);
		let buff = fs.readFileSync(file);
		let dbpf = new DBPF(buff);

		// Find the lotfile entry.
		let entry = dbpf.entries.find(entry => entry.type===FileType.LotFile);
		let lotFile = entry.read();
		
		// Loop all lots & make historical.
		let i = 0;
		for (let lot of lotFile) {
			i++;
			lot.historical = true;
		}
		console.log(chalk.green('OK'), chalk.gray('Marked '+i+' lots as historical'));

		// Save again.
		let out;
		if (this.force) {
			out = file;
		} else {
			out = this.output;
			if (!out) {
				out = 'HISTORICAL-'+path.basename(file);
			}
			let dir = path.dirname(file);
			out = path.resolve(dir, out);
		}

		console.log(chalk.cyan('SAVING'), out);
		await dbpf.save({"file": out});

	});

// Some commands.
program
	.command('tileset [dir]', 'Add all buildings in the given directory to the given tilesets')
	.option('-b --block', 'Block all buildings from growing')
	.option('-C --chicago', 'Set the Chicago tileset for all buildings')
	.option('-N --ny', 'Set the New York tileset for all buildings')
	.option('-H --houston', 'Set the Houston tileset for all buildings')
	.option('-E --euro', 'Set the Euro tileset for all buildings')
	.option('-r --recursive', 'Scan directories recursively')
	.action(function(dir) {

		let start = new Date();

		if (!dir) {
			dir = process.cwd();
		}
		dir = path.resolve(process.cwd(), dir);

		// Check which tilesets need to be set.
		let sets = [];
		if (this.block) {
			sets.push(0);
		} else  {
			if (this.chicago) sets.push(Style.Chicago);
			if (this.ny) sets.push(Style.NewYork);
			if (this.houston) sets.push(Style.Houston);
			if (this.euro) sets.push(Style.Euro);
		}

		console.log(chalk.green('SCANNING IN'), dir, chalk.cyan('RECURSIVE?'), !!this.recursive);

		let all = [];
		read(dir, function(file) {

			let name = path.basename(file);

			// Note: if the file starts with zzz_BLOCK_, skip it.
			if (name.match(/^zzz_BLOCK_/)) {
				return;
			}

			let dir = path.dirname(file);
			let buff = fs.readFileSync(file);

			// Check the first 4 bytes. Should be DBPF, otherwise no point in 
			// reading it.
			if (buff.toString('utf8', 0, 4) !== 'DBPF') return;

			console.log(chalk.cyan('SCANNING'), chalk.gray(name));
			let dbpf = new DBPF(buff);
			let shouldSave = false;
			for (let entry of dbpf.exemplars) {

				// Note: not parsing textual exemplars for now, but we should 
				// allow it later on! A parser should be written for it 
				// though...
				let exemplar = entry.read();
				for (let prop of exemplar.props) {
					
					// Look for the "OccupantGroups" property.
					if (prop.id === 0xAA1DD396) {
						chalk.gray('FOUND "OccupantGroups"');

						// Filter out any existing styles.
						shouldSave = true;
						prop.value = prop.value.filter(function(style) {
							return !(Style.Chicago<=style&&style<=Style.Euro);
						});

						// Push in the new styles.
						prop.value.push(...sets);

					}
				}
			}

			if (shouldSave) {
				let override = 'zzz_BLOCK_'+name;
				console.log(chalk.green('SAVING TO'), chalk.gray(override));
				override = path.join(dir, override);
				let buff = dbpf.toBuffer();
				fs.writeFileSync(override, buff);
			}
			

		}, !!this.recursive);

		let time = new Date() - start;
		console.log(chalk.green('DONE'), chalk.gray('('+time+'ms)'));

	});

program.parse(process.argv);

// # read(dir, cb, recursive)
function read(dir, cb, recursive) {

	let stat = fs.statSync(dir);
	if (!stat.isDirectory()) {
		cb(dir);
		return;
	}

	let list = fs.readdirSync(dir);
	for (let entry of list) {
		let full = path.join(dir, entry);
		let stat = fs.statSync(full);
		if (stat.isDirectory()) {
			if (recursive) {
				read(full, cb, recursive);
			}
		} else {
			cb(full);
		}
	}
}