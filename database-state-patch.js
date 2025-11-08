    async applyStateToDB(changes) {
        if (!this.db) return;

        try {
            // Update world state
            if (changes.world) {
                await this.db.updateCampaignState({
                    currentLocation: changes.world.currentLocation,
                    timeOfDay: changes.world.timeOfDay,
                    weather: changes.world.weather
                });
            }

            // Update party credits
            if (changes.party?.credits !== undefined) {
                await this.db.updateCampaignState({
                    partyCredits: changes.party.credits
                });
            }

            // Update characters
            if (changes.characters) {
                for (const [charName, charChanges] of Object.entries(changes.characters)) {
                    const character = await this.db.getCharacter(charName);
                    if (!character) {
                        console.warn(`⚠️  Character ${charName} not found in database`);
                        continue;
                    }

                    // HP changes
                    if (charChanges.hp) {
                        await this.db.updateCharacterHP(
                            character.id,
                            charChanges.hp.current,
                            charChanges.hp.max
                        );
                    }

                    // Credits
                    if (charChanges.credits !== undefined) {
                        await this.db.updateCharacterCredits(character.id, charChanges.credits);
                    }

                    // Equipment additions
                    if (charChanges.equipment?.add) {
                        for (const item of charChanges.equipment.add) {
                            // Try to categorize equipment type
                            let itemType = 'gear';
                            const itemLower = item.toLowerCase();
                            if (itemLower.includes('sword') || itemLower.includes('hammer') ||
                                itemLower.includes('axe') || itemLower.includes('bow') ||
                                itemLower.includes('dagger')) {
                                itemType = 'weapon';
                            } else if (itemLower.includes('armor') || itemLower.includes('mail')) {
                                itemType = 'armor';
                            } else if (itemLower.includes('shield')) {
                                itemType = 'shield';
                            }

                            await this.db.addEquipment(character.id, item, itemType, {}, true, 'ai-extracted');
                        }
                    }

                    // Equipment removals
                    if (charChanges.equipment?.remove) {
                        const equipment = await this.db.getEquipment(character.id);
                        for (const itemName of charChanges.equipment.remove) {
                            const eq = equipment.find(e => e.item_name === itemName);
                            if (eq) {
                                await this.db.removeEquipment(eq.id);
                            }
                        }
                    }

                    // Inventory additions
                    if (charChanges.inventory?.add) {
                        for (const item of charChanges.inventory.add) {
                            await this.db.addInventoryItem(character.id, item, 'misc', 1, {}, 'ai-extracted');
                        }
                    }

                    // Inventory removals
                    if (charChanges.inventory?.remove) {
                        const inventory = await this.db.getInventory(character.id);
                        for (const itemName of charChanges.inventory.remove) {
                            const item = inventory.find(i => i.item_name === itemName);
                            if (item) {
                                await this.db.removeInventoryItem(item.id);
                            }
                        }
                    }

                    // Spell additions
                    if (charChanges.spells?.add) {
                        for (const spell of charChanges.spells.add) {
                            // Detect if it's an ability vs spell
                            const isAbility = spell.includes('Feature') || spell.includes('Expertise') || spell.includes('Action');

                            // Try to extract level from spell name
                            let spellLevel = null;
                            const levelMatch = spell.match(/\((\d+)(?:st|nd|rd|th) Level\)/i);
                            if (levelMatch) {
                                spellLevel = parseInt(levelMatch[1]);
                            } else if (spell.includes('Cantrip')) {
                                spellLevel = 0;
                            }

                            await this.db.addSpell(character.id, spell, spellLevel, null, isAbility, {});
                        }
                    }

                    // Spell removals
                    if (charChanges.spells?.remove) {
                        const spells = await this.db.getSpells(character.id);
                        for (const spellName of charChanges.spells.remove) {
                            const spell = spells.find(s => s.spell_name === spellName);
                            if (spell) {
                                await this.db.removeSpell(spell.id);
                            }
                        }
                    }

                    // Condition additions
                    if (charChanges.conditions?.add) {
                        for (const condition of charChanges.conditions.add) {
                            await this.db.addCondition(character.id, condition);
                        }
                    }

                    // Condition removals
                    if (charChanges.conditions?.remove) {
                        const conditions = await this.db.getConditions(character.id);
                        for (const condName of charChanges.conditions.remove) {
                            const cond = conditions.find(c => c.condition_name === condName);
                            if (cond) {
                                await this.db.removeCondition(cond.id);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error applying state to database:', error);
            throw error;
        }
    }
