package com.chad.service;

import com.chad.model.Chemical;
import com.chad.repository.ChemicalRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ChemicalService {

    private final ChemicalRepository chemicalRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ChemicalService(ChemicalRepository chemicalRepository) {
        this.chemicalRepository = chemicalRepository;
    }

    public Optional<Chemical> findByName(String name) {
        List<Chemical> chemicals = chemicalRepository.findByNameIgnoreCase(name);
        if (chemicals.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(chemicals.get(0));
    }

    public Chemical saveOrUpdateChemical(String name, Object propertiesObject) {
        Map<String, Object> propertiesMap;
        try {
            propertiesMap = objectMapper.convertValue(propertiesObject, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            propertiesMap = Map.of(); // fallback to empty map
        }

        Optional<Chemical> existing = findByName(name);
        Chemical chemical;
        if (existing.isPresent()) {
            chemical = existing.get();
            chemical.setProperties(propertiesMap);
        } else {
            chemical = new Chemical();
            chemical.setName(name);
            chemical.setProperties(propertiesMap);
        }
        return chemicalRepository.save(chemical);
    }
}
